/* Copyright (C) 2026 flywave.gl contributors */

import { MapView, MapViewEventNames, type RenderEvent } from "@flywave/flywave-mapview";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import * as THREE from "three/webgpu";

import { HeightRange } from "./curtainGeometry";
import { DrapedSurfaceMaterialOptions } from "./DrapedTarget";
import { DrapedPrismMaterial } from "./DrapedSurfaceMaterial";
import { buildPrismGeometry } from "./prismGeometry";

type RingLike = Array<GeoCoordinates | { latitude: number; longitude: number }>;

export interface DrapedPolygonOptions extends DrapedSurfaceMaterialOptions {
    /** Outer boundary; input altitudes are ignored by the volume build. */
    outerRing: RingLike;
    holes?: RingLike[];
    /** Vertical span of the prism. */
    heightRange: HeightRange;
}

/**
 * A filled polygon draped onto captured ground surfaces, following the same
 * depth-reconstruction principle as {@link DrapedLine}: an extruded prism
 * provides rasterization coverage only; the visible fill is decided per
 * fragment against the captured ground position and the fragment's own
 * footprint triangle.
 */
export class DrapedPolygon {
    public readonly group = new THREE.Group();
    public readonly material: DrapedPrismMaterial;

    private readonly m_mapView: MapView;
    private readonly m_options: DrapedPolygonOptions;
    private readonly m_rawMaterial: boolean;
    private m_mesh: THREE.Mesh | null = null;
    private m_geometry: THREE.BufferGeometry | null = null;
    private m_announcedVisible = false;
    private readonly m_willRenderListener: (event: RenderEvent) => void;

    constructor(mapView: MapView, options: DrapedPolygonOptions) {
        this.m_mapView = mapView;
        this.m_options = options;
        this.m_rawMaterial = options.debugRawMaterial === true;
        this.material = this.m_rawMaterial
            ? (new THREE.MeshBasicNodeMaterial({
                  color: 0xff00ff,
                  side: THREE.DoubleSide
              }) as unknown as DrapedPrismMaterial)
            : new DrapedPrismMaterial(options);
        if (!this.m_rawMaterial && (options.debugLevel ?? 0) >= 1) {
            this.material.applyDebugOverride(options.debugLevel!);
        }

        this.m_willRenderListener = () => this.syncBeforeRender();
        mapView.addEventListener(MapViewEventNames.WillRender, this.m_willRenderListener);

        this.setBoundary(options.outerRing, options.holes);
        this.group.anchor = options.outerRing[0];
        mapView.mapAnchors.add(this.group);
    }

    /** Replace the polygon boundary; rebuilds the prism locally. */
    public setBoundary(outerRing: RingLike, holes?: RingLike[]): void {
        this.m_options.outerRing = outerRing;
        this.m_options.holes = holes;
        const projectRing = (ring: RingLike) =>
            ring.map(p =>
                this.m_mapView.projection.projectPoint(
                    p instanceof GeoCoordinates ? p : new GeoCoordinates(p.latitude, p.longitude),
                    new THREE.Vector3()
                )
            );

        const worldOuter = projectRing(outerRing);
        const worldHoles = (holes ?? []).map(projectRing);

        this.m_geometry?.dispose();
        const built = buildPrismGeometry({
            outerRing: worldOuter,
            holes: worldHoles.length > 0 ? worldHoles : undefined,
            heightRange: this.m_options.heightRange,
            origin: worldOuter[0].clone()
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

    private syncBeforeRender(): void {
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
        // Meters-per-pixel scale for the current camera and viewport (kept in
        // sync even though the prism test itself does not use it).
        const height = this.m_mapView.renderer.getDrawingBufferSize(this.m_scratchSize).y;
        const fovRad = THREE.MathUtils.degToRad(this.m_mapView.camera.fov);
        this.material.setPixelsPerMeterFactor((2 * Math.tan(fovRad / 2)) / Math.max(1, height));
    }

    private announceVisible(): void {
        if (this.m_announcedVisible) {
            return;
        }
        this.m_announcedVisible = true;
        console.log("[DrapedPolygon] first frame with mesh visible");
    }
}
