// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix4, Vector2, Vector3, type Camera } from "three";
import { renderGroup, uniform } from "three/tsl";
import { NodeBuilder, type Renderer, type Texture } from "three/webgpu";

import { AtmosphereContextBase } from "./AtmosphereContextBase";
import { AtmosphereLUTNode } from "./AtmosphereLUTNode";
import { AtmosphereParameters } from "./AtmosphereParameters";

const vectorScratch = /*#__PURE__*/ new Vector3();

export class AtmosphereContext extends AtmosphereContextBase {
    lutNode: AtmosphereLUTNode;

    matrixWorldToECEF: any = uniform("mat4").setGroup(renderGroup).setName("matrixWorldToECEF");

    matrixECIToECEF: any = uniform("mat4").setGroup(renderGroup).setName("matrixECIToECEF");

    sunDirectionECEF: any = uniform("vec3").setGroup(renderGroup).setName("sunDirectionECEF");

    moonDirectionECEF: any = uniform("vec3").setGroup(renderGroup).setName("moonDirectionECEF");

    matrixMoonFixedToECEF: any = uniform("mat4")
        .setGroup(renderGroup)
        .setName("matrixMoonFixedToECEF");

    scatteringSampleCount: any = uniform(new Vector2(4, 14))
        .setGroup(renderGroup)
        .setName("scatteringSampleCount");

    matrixViewToECEF: any = uniform("mat4")
        .setGroup(renderGroup)
        .setName("matrixViewToECEF")
        .onRenderUpdate((frame, { value }) => {
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            // view → ECEF = matrixWorldToECEF × camera.matrixWorld
            // (camera.matrixWorld transforms camera-local→world, i.e., view→world)
            value.multiplyMatrices(this.matrixWorldToECEF.value, camera.matrixWorld);
        });

    matrixECEFToWorld: any = uniform("mat4")
        .setGroup(renderGroup)
        .setName("matrixECEFToWorld")
        .onRenderUpdate((_, { value }) => {
            value.copy(this.matrixWorldToECEF.value).invert();
        });

    matrixECEFToView: any = uniform("mat4")
        .setGroup(renderGroup)
        .setName("matrixECEFToView")
        .onRenderUpdate((frame, { value }) => {
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            value.multiplyMatrices(
                camera.matrixWorldInverse,
                value.copy(this.matrixWorldToECEF.value).invert()
            );
        });

    cameraPositionECEF: any = uniform("vec3")
        .setGroup(renderGroup)
        .setName("cameraPositionECEF")
        .onRenderUpdate((frame, { value }) => {
            if (this._overrideCameraPositionECEF != null) {
                value.copy(this._overrideCameraPositionECEF);
                return;
            }
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            value
                .setFromMatrixPosition(camera.matrixWorld)
                .applyMatrix4(this.matrixWorldToECEF.value);
        });

    altitudeCorrectionECEF: any = uniform("vec3")
        .setGroup(renderGroup)
        .setName("altitudeCorrectionECEF")
        .onRenderUpdate((frame, { value }) => {
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                value.setScalar(0);
                return;
            }
            // WGS84 ellipsoid parameters
            const a = 6378137.0;
            const b = 6356752.314245;
            const a2 = a * a;
            const b2 = b * b;
            const pos = vectorScratch
                .setFromMatrixPosition(camera.matrixWorld)
                .applyMatrix4(this.matrixWorldToECEF.value);

            // Project position onto ellipsoid surface (geodetic projection)
            const rx = 1 / a2;
            const ry = 1 / a2;
            const rz = 1 / b2;
            const x2 = pos.x * pos.x * rx;
            const y2 = pos.y * pos.y * ry;
            const z2 = pos.z * pos.z * rz;
            const normSquared = x2 + y2 + z2;
            if (!Number.isFinite(normSquared) || normSquared < 0.1) {
                value.setScalar(0);
                return;
            }

            // Iterative geodetic projection
            const ratio = Math.sqrt(1 / normSquared);
            const ix = pos.x * ratio;
            const iy = pos.y * ratio;
            const iz = pos.z * ratio;
            const gx = ix * rx * 2;
            const gy = iy * ry * 2;
            const gz = iz * rz * 2;
            const gLen = Math.sqrt(gx * gx + gy * gy + gz * gz);
            let lambda = ((1 - ratio) * pos.length()) / (gLen / 2);
            let correction = 0;
            let sx: number, sy: number, sz: number, error: number;
            do {
                lambda -= correction;
                sx = 1 / (1 + lambda * rx);
                sy = 1 / (1 + lambda * ry);
                sz = 1 / (1 + lambda * rz);
                const sx2 = sx * sx,
                    sy2 = sy * sy,
                    sz2 = sz * sz;
                const sx3 = sx2 * sx,
                    sy3 = sy2 * sy,
                    sz3 = sz2 * sz;
                error = x2 * sx2 + y2 * sy2 + z2 * sz2 - 1;
                correction = error / ((x2 * sx3 * rx + y2 * sy3 * ry + z2 * sz3 * rz) * -2);
            } while (Math.abs(error) > 1e-12);

            const surfX = pos.x * sx;
            const surfY = pos.y * sy;
            const surfZ = pos.z * sz;

            // Compute osculating sphere center at surface point
            // normal = (surfX/a², surfY/a², surfZ/b²) normalized
            const nx = surfX / a2;
            const ny = surfY / a2;
            const nz = surfZ / b2;
            const nLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
            const bottomRadius = this.parameters.bottomRadius;
            // center = surface - normal * bottomRadius
            // correction = -center = normal * bottomRadius - surface
            value.set(
                nx * nLen * bottomRadius - surfX,
                ny * nLen * bottomRadius - surfY,
                nz * nLen * bottomRadius - surfZ
            );
        });

    cameraHeight: any = uniform(0)
        .setGroup(renderGroup)
        .setName("cameraHeight")
        .onRenderUpdate((frame, self) => {
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            // Compute geodetic height: project camera onto ellipsoid surface,
            // then height = distance from camera to surface point along normal.
            const a = 6378137.0;
            const b = 6356752.314245;
            const a2 = a * a;
            const b2 = b * b;
            const pos = vectorScratch
                .setFromMatrixPosition(camera.matrixWorld)
                .applyMatrix4(this.matrixWorldToECEF.value);

            // Use the altitudeCorrectionECEF offset to get the osculating sphere
            // center, then compute height as distance from center minus bottomRadius
            const rx = 1 / a2;
            const rz = 1 / b2;
            const x2 = pos.x * pos.x * rx;
            const y2 = pos.y * pos.y * rx;
            const z2 = pos.z * pos.z * rz;
            const normSquared = x2 + y2 + z2;
            if (!Number.isFinite(normSquared) || normSquared < 0.1) {
                self.value = pos.length() - this.parameters.bottomRadius;
                return;
            }
            // Iterative projection
            const ratio = Math.sqrt(1 / normSquared);
            const ix = pos.x * ratio;
            const iy = pos.y * ratio;
            const iz = pos.z * ratio;
            const gx = ix * rx * 2;
            const gy = iy * rx * 2;
            const gz = iz * rz * 2;
            const gLen = Math.sqrt(gx * gx + gy * gy + gz * gz);
            let lambda = ((1 - ratio) * pos.length()) / (gLen / 2);
            let correction = 0;
            let sx: number, sy: number, sz: number, error: number;
            do {
                lambda -= correction;
                sx = 1 / (1 + lambda * rx);
                sy = 1 / (1 + lambda * rx);
                sz = 1 / (1 + lambda * rz);
                const sx2 = sx * sx,
                    sy2 = sy * sy,
                    sz2 = sz * sz;
                const sx3 = sx2 * sx,
                    sy3 = sy2 * sy,
                    sz3 = sz2 * sz;
                error = x2 * sx2 + y2 * sy2 + z2 * sz2 - 1;
                correction = error / ((x2 * sx3 * rx + y2 * sy3 * rx + z2 * sz3 * rz) * -2);
            } while (Math.abs(error) > 1e-12);

            const surfX = pos.x * sx;
            const surfY = pos.y * sy;
            const surfZ = pos.z * sz;
            self.value = Math.sqrt(
                (pos.x - surfX) ** 2 + (pos.y - surfY) ** 2 + (pos.z - surfZ) ** 2
            );
        });

    cameraPositionUnit = this.cameraPositionECEF
        .mul(this.parametersNode.worldToUnit)
        .toVar("cameraPositionUnit"); // BUG: Cannot use toConst() here

    altitudeCorrectionUnit = this.altitudeCorrectionECEF
        .mul(this.parametersNode.worldToUnit)
        .toVar("altitudeCorrectionUnit"); // BUG: Cannot use toConst() here

    camera?: Camera;
    _overrideCameraPositionECEF?: Vector3 | null;
    ellipsoidRadius = 6378137;
    correctAltitude = true;
    constrainCamera = true;
    showGround = true;
    accurateShadowScattering = true;
    raymarchScattering = true;

    // Cloud shadow state. Populated by CloudRenderNode.updateBefore() each frame.
    // Consumed by AtmosphereLightNode.setupDirect() to attenuate direct sun light.
    cloudShadowEnabled = false;
    cloudShadowArrayNode: any = null;
    cloudShadowTextureNodes: any[] = [null, null, null, null];
    // Raw (non-temporally-resolved) shadow textures for ground shadow projection.
    // Using raw textures avoids temporal mismatch with current-frame cascade matrices.
    cloudShadowRawTextureNodes: any[] = [null, null, null, null];
    cloudShadowMatrices: Matrix4[] = [new Matrix4(), new Matrix4(), new Matrix4(), new Matrix4()];
    cloudShadowIntervals: Vector2[] = [
        new Vector2(0, 1),
        new Vector2(0, 1),
        new Vector2(0, 1),
        new Vector2(0, 1)
    ];
    cloudShadowCascadeCount = 0;
    cloudShadowFar = 50000;
    cloudShadowTopHeight = 8000;

    constructor(
        parameters = new AtmosphereParameters(),
        lutNode = new AtmosphereLUTNode(parameters)
    ) {
        super(parameters);
        this.lutNode = lutNode;
    }

    override dispose(): void {
        this.lutNode.dispose();
        super.dispose();
    }
}

/** @deprecated Use AtmosphereContext instead. */
export const AtmosphereContextNode = AtmosphereContext;

let fallbackContext: AtmosphereContext | undefined;

export function registerAtmosphereContext(context: AtmosphereContext): void {
    fallbackContext = context;
}

export function getAtmosphereContext(host: NodeBuilder | Renderer): AtmosphereContext {
    const hostContext = host instanceof NodeBuilder ? host.context : host.contextNode.value;
    if (typeof hostContext.getAtmosphere === "function") {
        const atmosphereContext = hostContext.getAtmosphere();
        if (atmosphereContext instanceof AtmosphereContext) {
            return atmosphereContext;
        }
    }
    if (fallbackContext != null) {
        return fallbackContext;
    }
    throw new Error("getAtmosphere() was not found in the context.");
}
