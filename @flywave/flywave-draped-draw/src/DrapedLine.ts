/* Copyright (C) 2026 flywave.gl contributors */

import {
    MapView,
    MapViewEventNames,
    type ElevationProvider,
    type RenderEvent
} from "@flywave/flywave-mapview";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import * as THREE from "three/webgpu";

import { buildCurtainGeometry, HeightRange } from "./curtainGeometry";
import { DrapedSurfaceMaterialOptions, DrapedTarget } from "./DrapedTarget";
import { DrapedCurtainMaterial } from "./DrapedSurfaceMaterial";
import { positionLocal } from "three/tsl";

export interface DrapedLineOptions extends DrapedSurfaceMaterialOptions {
    /** Polyline vertices; input altitudes are ignored by the volume build. */
    positions: Array<GeoCoordinates | { latitude: number; longitude: number }>;
    loop?: boolean;
    /**
     * Vertical span of the curtain per segment. Defaults cover a generous
     * band around typical terrain; tighten per segment for less overdraw.
     */
    heightRanges?: HeightRange | HeightRange[];
}

type RingLike = Array<GeoCoordinates | { latitude: number; longitude: number }>;

/**
 * A polyline draped onto captured ground surfaces.
 *
 * The visual result does not depend on the curtain geometry touching the
 * terrain: fragments are placed by reconstructing the captured ground
 * position from scene depth, so the line follows terrain exactly while the
 * underlying geometry stays a simple two-panel volume.
 *
 * The object persists through the scene graph rebuild cycle by living on a
 * map anchor (`mapView.mapAnchors`).
 */
export class DrapedLine {
    public readonly group = new THREE.Group();
    public readonly material: DrapedCurtainMaterial;

    private readonly m_mapView: MapView;
    private readonly m_options: DrapedLineOptions;
    private readonly m_rawMaterial: boolean;
    private readonly m_debugPlainMaterial = new THREE.MeshBasicNodeMaterial({
        color: 0xff00ff,
        side: THREE.DoubleSide
    });
    private m_rawView = false;
    private m_terrainHeightsResolved = false;
    private m_lastRect: { west: number; south: number; east: number; north: number } | null = null;
    private m_mesh: THREE.Mesh | null = null;
    private m_geometry: THREE.BufferGeometry | null = null;
    private m_announcedVisible = false;
    private readonly m_willRenderListener: (event: RenderEvent) => void;

    constructor(mapView: MapView, options: DrapedLineOptions) {
        this.m_mapView = mapView;
        this.m_options = options;
        this.m_rawMaterial = options.debugRawMaterial === true;
        this.material = this.m_rawMaterial
            ? (new THREE.MeshBasicNodeMaterial({
                  color: 0xff00ff,
                  side: THREE.DoubleSide
              }) as unknown as DrapedCurtainMaterial)
            : new DrapedCurtainMaterial(options);
        if (!this.m_rawMaterial && (options.debugLevel ?? 0) >= 1) {
            this.material.applyDebugOverride(options.debugLevel!);
            if (options.debugLevel! >= 2) {
                this.material.positionNode = positionLocal;
            }
        }

        this.m_willRenderListener = () => this.syncBeforeRender();
        mapView.addEventListener(MapViewEventNames.WillRender, this.m_willRenderListener);

        this.setPositions(options.positions);
        this.group.anchor = options.positions[0];
        mapView.mapAnchors.add(this.group);
    }

    /** Replace the polyline vertices; rebuilds the curtain locally. */
    public setPositions(positions: RingLike): void {
        this.m_options.positions = positions;
        const world = positions.map(p =>
            this.m_mapView.projection.projectPoint(
                p instanceof GeoCoordinates ? p : new GeoCoordinates(p.latitude, p.longitude),
                new THREE.Vector3()
            )
        );
        this.m_geometry?.dispose();
        const built = buildCurtainGeometry({
            positions: world,
            heightRanges: this.m_options.heightRanges,
            loop: this.m_options.loop,
            origin: world[0].clone()
        });
        this.m_geometry = built.geometry;

        if (this.m_mesh === null) {
            this.m_mesh = new THREE.Mesh(built.geometry, this.material);
            this.m_mesh.frustumCulled = false;
            this.m_mesh.visible = false; // until capture textures are bound
            this.group.add(this.m_mesh);
        } else {
            this.m_mesh.geometry = built.geometry;
        }
        this.m_mapView.update();
    }

    /**
     * Inspection aid: render the raw curtain geometry with a plain material,
     * bypassing the draped fragment logic entirely. Shows exactly where the
     * volume panels sit in the world.
     */
    public setRawGeometryView(on: boolean): void {
        this.m_rawView = on;
        if (this.m_mesh !== null) {
            this.m_mesh.material = on ? this.m_debugPlainMaterial : this.material;
            if (on) {
                this.m_mesh.visible = true;
            }
        }
    }

    /** Diagnostic: disable depth testing so foreground terrain cannot hide the band. */
    public setDepthTestEnabled(on: boolean): void {
        this.material.depthTest = on;
        this.material.needsUpdate = true;
    }

    public removeFromMap(): void {
        this.m_mapView.removeEventListener(MapViewEventNames.WillRender, this.m_willRenderListener);
        this.m_mapView.mapAnchors.remove(this.group);
    }

    public dispose(): void {
        this.removeFromMap();
        this.m_geometry?.dispose();
        this.material.dispose();
    }

    private readonly m_scratchSize = new THREE.Vector2();
    private m_statusHud: HTMLDivElement | null = null;

    private updateStatusHud(bound: boolean): void {
        if (this.m_statusHud === null) {
            this.m_statusHud = document.createElement("div");
            this.m_statusHud.style.cssText =
                "position:fixed;top:4px;left:6px;z-index:9999;font:12px monospace;" +
                "color:#0f0;background:rgba(0,0,0,.55);padding:2px 6px;pointer-events:none";
            document.body.appendChild(this.m_statusHud);
        }
        const flip = (this.material as unknown as { depthFlipUniform?: { value: number } })
            .depthFlipUniform?.value;
        this.m_statusHud.textContent =
            `${
                (this.material as unknown as { constructor?: { BUILD?: string } }).constructor
                    ?.BUILD
            } ` + `bound=${bound ? "Y" : "N"} vis=${this.m_mesh?.visible ? "Y" : "N"} flip=${flip}`;
    }

    private syncBeforeRender(): void {
        if (this.m_rawView) {
            return; // plain-material inspection: keep whatever is on the mesh
        }
        if (this.m_rawMaterial) {
            if (this.m_mesh !== null) {
                this.m_mesh.visible = true;
            }
            this.announceVisible();
            return;
        }
        const bound = this.material.syncCaptureTextures(this.m_options.capturePass);
        if (this.m_mesh !== null) {
            this.m_mesh.visible = bound;
        }
        if (bound) {
            this.announceVisible();
        }
        // Meters-per-pixel scale for the current camera and viewport.
        const height = this.m_mapView.renderer.getDrawingBufferSize(this.m_scratchSize).y;
        const fovRad = THREE.MathUtils.degToRad(this.m_mapView.camera.fov);
        this.material.setPixelsPerMeterFactor((2 * Math.tan(fovRad / 2)) / Math.max(1, height));
    }

    private announceVisible(): void {
        if (this.m_announcedVisible) {
            return;
        }
        this.m_announcedVisible = true;
        console.log("[DrapedLine] first frame with mesh visible");
    }
}
