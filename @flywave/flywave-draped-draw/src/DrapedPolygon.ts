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
    private m_anchorAbsWorld: THREE.Vector3 | null = null;
    private m_planarFrame: {
        southWestCorner: THREE.Vector3;
        eastWard: THREE.Vector3;
        northWard: THREE.Vector3;
        extents: THREE.Vector2;
    } | null = null;
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
        this.m_planarFrame = built.planarFrame;
        const invExt = new THREE.Vector2(
            1 / built.planarFrame.extents.x,
            1 / built.planarFrame.extents.y
        );
        this.material.setInverseExtents(invExt);
        console.log(
            `[polygon] extents ${built.planarFrame.extents.x.toFixed(
                0
            )}x${built.planarFrame.extents.y.toFixed(0)}`
        );
        this.m_anchorAbsWorld = new THREE.Vector3();
        {
            const first = outerRing[0];
            const geo =
                first instanceof GeoCoordinates
                    ? first
                    : new GeoCoordinates(first.latitude, first.longitude);
            this.m_mapView.projection.projectPoint(geo, this.m_anchorAbsWorld);
        }

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
    private m_statusHud: HTMLDivElement | null = null;

    private updateStatusHud(bound: boolean): void {
        if (this.m_statusHud === null) {
            this.m_statusHud = document.createElement("div");
            this.m_statusHud.style.cssText =
                "position:fixed;top:26px;left:6px;z-index:9999;font:12px monospace;" +
                "color:#0ff;background:rgba(0,0,0,.55);padding:2px 6px;pointer-events:none";
            document.body.appendChild(this.m_statusHud);
        }
        this.m_statusHud.textContent = `polygon bound=${bound ? "Y" : "N"} vis=${
            this.m_mesh?.visible ? "Y" : "N"
        }`;
    }

    private static readonly BUILD = "P7-clampmask";

    private ensureHud(): void {
        if (this.m_statusHud === null) {
            this.m_statusHud = document.createElement("div");
            this.m_statusHud.style.cssText =
                "position:fixed;top:26px;left:6px;z-index:9999;font:12px monospace;" +
                "color:#0ff;background:rgba(0,0,0,.55);padding:2px 6px;pointer-events:none";
            document.body.appendChild(this.m_statusHud);
        }
    }

    private syncBeforeRender(): void {
        this.ensureHud();
        if (this.m_statusHud !== null) {
            const boundNow =
                this.m_options.capturePass.depthTexture !== null &&
                this.m_options.capturePass.typeTexture !== null;
            this.m_statusHud.textContent = `${DrapedPolygon.BUILD} tex=${
                boundNow ? "Y" : "N"
            } vis=${this.m_mesh?.visible ? "Y" : "N"}`;
        }

        // Transform the world-axis membership planes into EYE space each
        // frame (Cesium does this in its vertex stage; we do it CPU-side):
        //   n_eye = R^T * n_world,  d_eye = d + n_world . camPos
        // with positions expressed origin-relative (relCam).
        const cam = this.m_mapView.camera;
        const camPosW = new THREE.Vector3();
        cam.getWorldPosition(camPosW);
        // RTE note: group world position is CAMERA-RELATIVE; the membership
        // frame needs the ABSOLUTE anchor position instead.
        const relCam0 = camPosW.clone().sub(this.m_anchorAbsWorld ?? new THREE.Vector3());

        if (this.m_planarFrame !== null) {
            const frame = this.m_planarFrame;

            // ShadowVolumeAppearanceVS, ported line-for-line (single
            // instance, so the batch table becomes local members):
            //   eyeCorner = Rc^T * (corner - camPos)
            //   eastWard/northWard -> Rc^T * world dirs
            const rotT = new THREE.Matrix3().setFromMatrix4(cam.matrixWorld).transpose();
            const toEye = (worldRel: THREE.Vector3): THREE.Vector3 =>
                worldRel.clone().sub(relCam0).applyMatrix3(rotT);

            const southWestCorner = toEye(frame.southWestCorner);
            const northWestCorner = toEye(
                frame.northWard.clone().multiplyScalar(frame.extents.y).add(frame.southWestCorner)
            );
            const southEastCorner = toEye(
                frame.eastWard.clone().multiplyScalar(frame.extents.x).add(frame.southWestCorner)
            );

            const eastWard = southEastCorner.sub(southWestCorner);
            const eastExtent = eastWard.length();
            eastWard.divideScalar(eastExtent);

            const northWard = northWestCorner.sub(southWestCorner);
            const northExtent = northWard.length();
            northWard.divideScalar(northExtent);

            this.material.setPlanarFrame(
                new THREE.Vector4(
                    eastWard.x,
                    eastWard.y,
                    eastWard.z,
                    -eastWard.dot(southWestCorner)
                ),
                new THREE.Vector4(
                    northWard.x,
                    northWard.y,
                    northWard.z,
                    -northWard.dot(southWestCorner)
                )
            );
        }

        if (this.m_rawMaterial) {
            if (this.m_mesh !== null) {
                this.m_mesh.visible = true;
            }
            this.announceVisible();
            return;
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
