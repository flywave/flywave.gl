// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { type NodeBuilder, type Texture, type TextureNode, TempNode } from "three/webgpu";
import {
    add,
    float,
    Fn,
    If,
    mix,
    positionGeometry,
    positionView,
    remapClamp,
    screenCoordinate,
    screenUV,
    texture,
    vec2,
    vec3,
    vec4,
    viewportDepthTexture,
    viewportSharedTexture,
    viewportUV
} from "three/tsl";

import { inverseProjectionMatrix, projectionMatrix } from "../tsl/accessors";
import { rayEllipsoidIntersection } from "../tsl/math";
import type { Node } from "../tsl/node";
import { depthToViewZ, screenToPositionView } from "../tsl/transformations";
import { hashValues } from "../tsl/utils";
import { getAtmosphereContext } from "./AtmosphereContext";
import { getIndirectLuminanceToPoint, getSplitIlluminance } from "./runtime";
import { SkyNode, sky, skyBackdrop } from "./SkyNode";
const CAMERA = "CAMERA";
const BACKDROP = "BACKDROP";

type AerialPerspectiveNodeScope = typeof CAMERA | typeof BACKDROP;

export class AerialPerspectiveNode extends TempNode {
    static override get type(): string {
        return "AerialPerspectiveNode";
    }

    private readonly scope: AerialPerspectiveNodeScope;

    _colorNode: Node<"vec4">;
    _depthNode: TextureNode;
    _shadowLengthNode: Node<"vec2"> | null;
    _skyNode: SkyNode | null = null;
    _normalNode: Node<"vec3"> | null = null;

    _cameraPositionUnit: Node<"vec3"> | null = null;
    _rayDirectionECEF: Node<"vec3"> | null = null;

    correctGeometricError = true;
    lighting = false;
    transmittance = true;
    inscattering = true;
    moonScattering = false;

    // Cloud shadow length texture (god rays). Set from CloudRenderNode.
    cloudShadowLengthTexture: Texture | null = null;

    // Cloud overlay texture (cloud color + alpha). Set from CloudRenderNode.
    // AerialPerspective composites clouds at the end (matches reference overlay).
    cloudOverlayTexture: Texture | null = null;

    setCloudShadowLength(tex: Texture | null): void {
        if (this.cloudShadowLengthTexture !== tex) {
            this.cloudShadowLengthTexture = tex;
            this.needsUpdate = true;
        }
    }

    setCloudOverlay(tex: Texture | null): void {
        if (this.cloudOverlayTexture !== tex) {
            this.cloudOverlayTexture = tex;
            this.needsUpdate = true;
        }
    }

    constructor(
        scope: AerialPerspectiveNodeScope,
        colorNode: Node<"vec4">,
        depthNode: TextureNode,
        shadowLengthNode: Node<"vec2"> | null = null
    ) {
        super("vec4");
        this.scope = scope;
        this._colorNode = colorNode;
        this._depthNode = depthNode;
        this._shadowLengthNode = shadowLengthNode;
    }

    override customCacheKey(): number {
        return hashValues(
            this.correctGeometricError,
            this.lighting,
            this.transmittance,
            this.inscattering,
            this.moonScattering
        );
    }

    setConfig(
        config: Partial<{
            correctGeometricError: boolean;
            lighting: boolean;
            transmittance: boolean;
            inscattering: boolean;
            moonScattering: boolean;
        }>
    ): void {
        let changed = false;
        if (config.correctGeometricError != null && this.correctGeometricError !== config.correctGeometricError) {
            this.correctGeometricError = config.correctGeometricError;
            changed = true;
        }
        if (config.lighting != null && this.lighting !== config.lighting) {
            this.lighting = config.lighting;
            changed = true;
        }
        if (config.transmittance != null && this.transmittance !== config.transmittance) {
            this.transmittance = config.transmittance;
            changed = true;
        }
        if (config.inscattering != null && this.inscattering !== config.inscattering) {
            this.inscattering = config.inscattering;
            changed = true;
        }
        if (config.moonScattering != null && this.moonScattering !== config.moonScattering) {
            this.moonScattering = config.moonScattering;
            changed = true;
        }
        if (changed) this.needsUpdate = true;
    }

    override setup(builder: NodeBuilder): unknown {
        const atmosphereContext = getAtmosphereContext(builder);

        const { worldToUnit } = atmosphereContext.parameters;
        const {
            camera,
            ellipsoidRadius,
            matrixViewToECEF,
            sunDirectionECEF,
            moonDirectionECEF,
            cameraPositionUnit,
            altitudeCorrectionUnit
        } = atmosphereContext;

        const {
            _colorNode: colorNode,
            _depthNode: depthNode,
            _normalNode: normalNode,
            _shadowLengthNode: shadowLengthNode,
            _skyNode: skyNode
        } = this;

        // Merge cloud shadow length (god rays) into the effective shadow length
        // used by both surfaceLuminance and skyNode. Matches reference where
        // AerialPerspective reads cloud shadowLengthBuffer after clouds render.
        let effectiveShadowLengthNode = shadowLengthNode;
        if (this.cloudShadowLengthTexture != null) {
            const cloudShadowLen = texture(this.cloudShadowLengthTexture).sample(viewportUV).r;
            const cloudShadowLenVec2 = vec2(cloudShadowLen, float(0));
            effectiveShadowLengthNode =
                shadowLengthNode != null
                    ? shadowLengthNode.add(cloudShadowLenVec2)
                    : cloudShadowLenVec2;
        }

        // SkyNode also needs the merged shadow length (ground pixels reach sky
        // branch in reversed-Z, and sky radiance uses shadowLength for god rays).
        if (skyNode != null) {
            skyNode._shadowLengthNode = effectiveShadowLengthNode;
        }

        const depth = depthNode.load(screenCoordinate).r.toConst();

        const getCameraPositionUnit = (): Node<"vec3"> => {
            if (this.scope === BACKDROP) {
                // Move the camera onto the backdrop surface:
                return matrixViewToECEF
                    .mul(vec4(positionView, 1))
                    .xyz.mul(worldToUnit)
                    .toVarying("cameraPositionUnit");
            }
            return cameraPositionUnit;
        };

        const getRayDirectionECEF = (): Node<"vec3"> => {
            switch (this.scope) {
                case CAMERA: {
                    const positionView = inverseProjectionMatrix(camera).mul(
                        vec4(positionGeometry, 1)
                    ).xyz;
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

        const getSurfacePositionUnit = (): Node<"vec3"> => {
            const viewZ = depthToViewZ(depth, camera);
            const positionView = screenToPositionView(
                // TODO: Investigate why screenUV becomes incorrect.
                viewportUV,
                depth,
                viewZ,
                projectionMatrix(camera),
                inverseProjectionMatrix(camera)
            );
            return matrixViewToECEF.mul(vec4(positionView, 1)).xyz.mul(worldToUnit);
        };

        const surfaceLuminance = Fn(() => {
            let { _cameraPositionUnit: cameraPositionUnit, _rayDirectionECEF: rayDirectionECEF } =
                this;
            cameraPositionUnit ??= getCameraPositionUnit().toConst();
            rayDirectionECEF ??= getRayDirectionECEF().toConst();

            if (skyNode != null) {
                // Share the varyings with the sky node:
                skyNode._cameraPositionUnit = cameraPositionUnit;
                skyNode._rayDirectionECEF = rayDirectionECEF;
            }

            const positionUnit = getSurfacePositionUnit().toVar();

            // Changed our strategy on the geometric error correction, because we no
            // longer have LightingMask to exclude objects in space.
            const geometryCorrectionAmount = remapClamp(
                positionUnit.distance(cameraPositionUnit),
                // The distance to the horizon from the highest point on the earth,
                worldToUnit * 336_000,
                // The distance to the horizon at the top atmosphere
                worldToUnit * 876_000
            );

            // Geometry normal can be trivially corrected:
            const radiiUnit = vec3(ellipsoidRadius).mul(worldToUnit).toConst();
            const normalCorrected = positionUnit.div(radiiUnit.pow2()).normalize().toConst();

            if (this.correctGeometricError) {
                const intersection = rayEllipsoidIntersection(
                    cameraPositionUnit,
                    rayDirectionECEF,
                    radiiUnit
                ).x.toConst(); // Near side

                const positionCorrected = intersection
                    .greaterThanEqual(0)
                    .select(
                        rayDirectionECEF.mul(intersection).add(cameraPositionUnit),
                        // Fallback to radial projection:
                        normalCorrected.mul(radiiUnit)
                    )
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
                        normalECEF.assign(
                            mix(normalECEF, normalCorrected, geometryCorrectionAmount)
                        );
                    }
                } else {
                    normalECEF = positionUnit.normalize();
                }
                normalECEF = normalECEF.toConst();

                // Direct and indirect illuminance on the surface:
                const solarIlluminance = getSplitIlluminance(
                    positionUnit.add(altitudeCorrectionUnit),
                    normalECEF,
                    sunDirectionECEF
                ).toConst();
                let illuminance = add(
                    solarIlluminance.get("direct"),
                    solarIlluminance.get("indirect")
                );
                if (this.moonScattering) {
                    const lunarIlluminance = getSplitIlluminance(
                        positionUnit.add(altitudeCorrectionUnit),
                        normalECEF,
                        moonDirectionECEF
                    ).toConst();
                    illuminance = add(
                        illuminance,
                        lunarIlluminance.get("direct"),
                        lunarIlluminance.get("indirect")
                    );
                }
                return illuminance;
            })();

            const luminance = this.lighting
                ? colorNode.rgb.mul(illuminance).mul(1 / Math.PI) // Lambertian
                : colorNode.rgb;

            const solarLuminanceTransfer = getIndirectLuminanceToPoint(
                cameraPositionUnit.add(altitudeCorrectionUnit),
                positionUnit.add(altitudeCorrectionUnit),
                effectiveShadowLengthNode ?? vec2(0),
                sunDirectionECEF
            ).toConst();
            const transmittance = solarLuminanceTransfer.get("transmittance");
            let inscattering = solarLuminanceTransfer.get("luminance");

            if (this.moonScattering) {
                // TODO: Combine the raymarch when raymarchScattering is enabled.
                const lunarLuminanceTransfer = getIndirectLuminanceToPoint(
                    cameraPositionUnit.add(altitudeCorrectionUnit),
                    positionUnit.add(altitudeCorrectionUnit),
                    effectiveShadowLengthNode ?? vec2(0),
                    moonDirectionECEF
                ).toConst();

                // TODO: Consider moon phase
                inscattering = inscattering.add(
                    lunarLuminanceTransfer.get("luminance").mul(2.5e-6)
                );
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
            If(
                builder.renderer.reversedDepthBuffer
                    ? depth.lessThanEqual(0)
                    : depth.greaterThanEqual(1),
                () => {
                    if (skyNode != null) {
                        skyNode._inputNode = colorNode;
                        luminance.rgb.assign(skyNode);
                    }
                }
            ).Else(() => {
                luminance.rgb.assign(surfaceLuminance);
            });

            // Composite clouds at the end (matches reference overlay mechanism:
            // outputColor.rgb = outputColor.rgb * (1 - overlay.a) + overlay.rgb).
            // AerialPerspective processed the scene WITHOUT clouds; now blend them in.
            if (this.cloudOverlayTexture != null) {
                const overlay = texture(this.cloudOverlayTexture).sample(viewportUV);
                luminance.rgb.assign(luminance.rgb.mul(overlay.a.oneMinus()).add(overlay.rgb));
            }

            return luminance;
        })();
    }

    /** @deprecated Use inscattering instead. */
    get inscatter(): boolean {
        return this.inscattering;
    }

    /** @deprecated Use inscattering instead. */
    set inscatter(value: boolean) {
        this.inscattering = value;
    }
}

export const aerialPerspective = (
    colorNode: Node<"vec4">,
    depthNode: TextureNode,
    shadowLengthNode?: Node<"vec2"> | null
): AerialPerspectiveNode => {
    const node = new AerialPerspectiveNode(CAMERA, colorNode, depthNode, shadowLengthNode);
    node._skyNode = sky(shadowLengthNode);
    return node;
};

export const aerialPerspectiveBackdrop = (
    shadowLengthNode?: Node<"vec2"> | null
): AerialPerspectiveNode => {
    const node = new AerialPerspectiveNode(
        BACKDROP,
        viewportSharedTexture(),
        viewportDepthTexture()
    );
    node._skyNode = skyBackdrop(shadowLengthNode);
    return node;
};
