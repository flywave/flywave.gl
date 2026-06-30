// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { add, Fn, If, mix, positionGeometry, positionView, remapClamp, screenCoordinate, vec2, vec3, vec4, viewportDepthTexture, viewportSharedTexture, viewportUV } from "three/tsl";
import { TempNode } from "three/webgpu";
import { depthToViewZ } from "../tsl/transformations";
import { hashValues } from "../tsl/utils";
import { inverseProjectionMatrix, projectionMatrix } from "../tsl/accessors";
import { rayEllipsoidIntersection } from "../tsl/math";
import { screenToPositionView } from "../tsl/transformations";
import { getAtmosphereContext } from "./AtmosphereContext";
import { getIndirectLuminanceToPoint, getSplitIlluminance } from "./runtime";
import { sky, skyBackdrop } from "./SkyNode";
const CAMERA = "CAMERA";
const BACKDROP = "BACKDROP";
export class AerialPerspectiveNode extends TempNode {
    static get type() {
        return "AerialPerspectiveNode";
    }
    constructor(scope, colorNode, depthNode, shadowLengthNode = null) {
        super("vec4");
        this.skyNode = null;
        this.normalNode = null;
        this.cameraPositionUnit = null;
        this.rayDirectionECEF = null;
        this.correctGeometricError = true;
        this.lighting = false;
        this.transmittance = true;
        this.inscattering = true;
        this.moonScattering = false;
        this.scope = scope;
        this.colorNode = colorNode;
        this.depthNode = depthNode;
        this.shadowLengthNode = shadowLengthNode;
    }
    customCacheKey() {
        return hashValues(this.correctGeometricError, this.lighting, this.transmittance, this.inscattering, this.moonScattering);
    }
    setup(builder) {
        const atmosphereContext = getAtmosphereContext(builder);
        const { worldToUnit } = atmosphereContext.parameters;
        const { camera, ellipsoidRadius, matrixViewToECEF, sunDirectionECEF, moonDirectionECEF, cameraPositionUnit, altitudeCorrectionUnit } = atmosphereContext;
        const { colorNode, depthNode, normalNode, shadowLengthNode, skyNode } = this;
        const depth = depthNode.load(screenCoordinate).r.toConst();
        const getCameraPositionUnit = () => {
            if (this.scope === BACKDROP) {
                // Move the camera onto the backdrop surface:
                return matrixViewToECEF
                    .mul(vec4(positionView, 1))
                    .xyz.mul(worldToUnit)
                    .toVarying("cameraPositionUnit");
            }
            return cameraPositionUnit;
        };
        const getRayDirectionECEF = () => {
            switch (this.scope) {
                case CAMERA: {
                    const positionView = inverseProjectionMatrix(camera).mul(vec4(positionGeometry, 1)).xyz;
                    return matrixViewToECEF
                        .mul(vec4(positionView, 0))
                        .xyz.toVarying("rayDirectionECEF")
                        .normalize();
                }
                case BACKDROP: {
                    return matrixViewToECEF
                        .mul(vec4(positionView, 0))
                        .xyz.toVarying("rayDirectionECEF")
                        .normalize();
                }
            }
        };
        const getSurfacePositionUnit = () => {
            const viewZ = depthToViewZ(depth, camera);
            const positionView = screenToPositionView(
            // TODO: Investigate why screenUV becomes incorrect.
            viewportUV, depth, viewZ, projectionMatrix(camera), inverseProjectionMatrix(camera));
            return matrixViewToECEF.mul(vec4(positionView, 1)).xyz.mul(worldToUnit);
        };
        const surfaceLuminance = Fn(() => {
            let { cameraPositionUnit, rayDirectionECEF } = this;
            cameraPositionUnit ?? (cameraPositionUnit = getCameraPositionUnit().toConst());
            rayDirectionECEF ?? (rayDirectionECEF = getRayDirectionECEF().toConst());
            if (skyNode != null) {
                // Share the varyings with the sky node:
                skyNode.cameraPositionUnit = cameraPositionUnit;
                skyNode.rayDirectionECEF = rayDirectionECEF;
            }
            const positionUnit = getSurfacePositionUnit().toVar();
            // Changed our strategy on the geometric error correction, because we no
            // longer have LightingMask to exclude objects in space.
            const geometryCorrectionAmount = remapClamp(positionUnit.distance(cameraPositionUnit), 
            // The distance to the horizon from the highest point on the earth,
            worldToUnit * 336000, 
            // The distance to the horizon at the top atmosphere
            worldToUnit * 876000);
            // Geometry normal can be trivially corrected:
            const radiiUnit = vec3(ellipsoidRadius).mul(worldToUnit).toConst();
            const normalCorrected = positionUnit
                .div(radiiUnit.pow2())
                .normalize()
                .toConst();
            if (this.correctGeometricError) {
                const intersection = rayEllipsoidIntersection(cameraPositionUnit, rayDirectionECEF, radiiUnit).x.toConst(); // Near side
                const positionCorrected = intersection
                    .greaterThanEqual(0)
                    .select(rayDirectionECEF.mul(intersection).add(cameraPositionUnit), 
                // Fallback to radial projection:
                normalCorrected.mul(radiiUnit))
                    .uniformFlow();
                positionUnit.assign(mix(positionUnit, positionCorrected, geometryCorrectionAmount));
            }
            // Used only when `lighting` is enabled. Undefined in the backdrop.
            const illuminance = Fn(() => {
                // Normal vector of the surface:
                let normalECEF;
                if (normalNode != null) {
                    normalECEF = matrixViewToECEF.mul(vec4(normalNode.xyz, 0)).xyz;
                    if (this.correctGeometricError) {
                        normalECEF.assign(mix(normalECEF, normalCorrected, geometryCorrectionAmount));
                    }
                }
                else {
                    normalECEF = positionUnit.normalize();
                }
                normalECEF = normalECEF.toConst();
                // Direct and indirect illuminance on the surface:
                const solarIlluminance = getSplitIlluminance(positionUnit.add(altitudeCorrectionUnit), normalECEF, sunDirectionECEF).toConst();
                let illuminance = add(solarIlluminance.get("direct"), solarIlluminance.get("indirect"));
                if (this.moonScattering) {
                    const lunarIlluminance = getSplitIlluminance(positionUnit.add(altitudeCorrectionUnit), normalECEF, moonDirectionECEF).toConst();
                    illuminance = add(illuminance, lunarIlluminance.get("direct"), lunarIlluminance.get("indirect"));
                }
                return illuminance;
            })();
            const luminance = this.lighting
                ? colorNode.rgb.mul(illuminance).mul(1 / Math.PI) // Lambertian
                : colorNode.rgb;
            const solarLuminanceTransfer = getIndirectLuminanceToPoint(cameraPositionUnit.add(altitudeCorrectionUnit), positionUnit.add(altitudeCorrectionUnit), shadowLengthNode ?? vec2(0), sunDirectionECEF).toConst();
            const transmittance = solarLuminanceTransfer.get("transmittance");
            let inscattering = solarLuminanceTransfer.get("luminance");
            if (this.moonScattering) {
                // TODO: Combine the raymarch when raymarchScattering is enabled.
                const lunarLuminanceTransfer = getIndirectLuminanceToPoint(cameraPositionUnit.add(altitudeCorrectionUnit), positionUnit.add(altitudeCorrectionUnit), shadowLengthNode ?? vec2(0), moonDirectionECEF).toConst();
                // TODO: Consider moon phase
                inscattering = inscattering.add(lunarLuminanceTransfer.get("luminance").mul(2.5e-6));
            }
            let output = luminance;
            if (this.transmittance) {
                output = output.mul(transmittance);
            }
            if (this.inscattering) {
                output = output.add(inscattering);
            }
            return output;
        })();
        return Fn(() => {
            const luminance = colorNode.toVar();
            If(builder.renderer.reversedDepthBuffer
                ? depth.lessThanEqual(0)
                : depth.greaterThanEqual(1), () => {
                if (skyNode != null) {
                    skyNode.inputNode = colorNode;
                    luminance.rgb.assign(skyNode);
                }
            }).Else(() => {
                luminance.rgb.assign(surfaceLuminance);
            });
            return luminance;
        })();
    }
    /** @deprecated Use inscattering instead. */
    get inscatter() {
        return this.inscattering;
    }
    /** @deprecated Use inscattering instead. */
    set inscatter(value) {
        this.inscattering = value;
    }
}
export const aerialPerspective = (colorNode, depthNode, shadowLengthNode) => {
    const node = new AerialPerspectiveNode(CAMERA, colorNode, depthNode, shadowLengthNode);
    node.skyNode = sky(shadowLengthNode);
    return node;
};
export const aerialPerspectiveBackdrop = (shadowLengthNode) => {
    const node = new AerialPerspectiveNode(BACKDROP, viewportSharedTexture(), viewportDepthTexture());
    node.skyNode = skyBackdrop(shadowLengthNode);
    return node;
};
//# sourceMappingURL=AerialPerspectiveNode.js.map