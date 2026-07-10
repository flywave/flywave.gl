// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Fn, mix, nodeProxy, positionView, uv, vec2, vec3, vec4 } from "three/tsl";
import { type NodeBuilder, TempNode } from "three/webgpu";

import type { Node } from "../tsl/node";
import { equirectToDirectionWorld } from "../tsl/transformations";
import { hashValues } from "../tsl/utils";
import { getAtmosphereContext } from "./AtmosphereContext";
import { MoonNode } from "./MoonNode";
import { getIndirectLuminance } from "./runtime";
import { StarsNode } from "./StarsNode";
import { SunNode } from "./SunNode";

const CAMERA = "CAMERA";
const EQUIRECTANGULAR = "EQUIRECTANGULAR";
const BACKDROP = "BACKDROP";

type SkyNodeScope = typeof CAMERA | typeof EQUIRECTANGULAR | typeof BACKDROP;

export class SkyNode extends TempNode {
    static override get type(): string {
        return "SkyNode";
    }

    private readonly scope: SkyNodeScope;

    _shadowLengthNode: Node<"vec2"> | null;

    sunNode: SunNode;
    moonNode: MoonNode;
    starsNode: StarsNode;

    _inputNode: Node | null = null;
    _cameraPositionUnit: Node<"vec3"> | null = null;
    _rayDirectionECEF: Node<"vec3"> | null = null;

    showSun = true;
    showMoon = true;
    showStars = false;
    moonScattering = false;

    constructor(scope: SkyNodeScope, shadowLengthNode: Node<"vec2"> | null = null) {
        super("vec3");
        this.scope = scope;
        this._shadowLengthNode = shadowLengthNode;
        this.sunNode = new SunNode();
        this.moonNode = new MoonNode();
        this.starsNode = new StarsNode();
    }

    override customCacheKey(): number {
        return hashValues(this.showSun, this.showMoon, this.showStars, this.moonScattering);
    }

    override setup(builder: NodeBuilder): Node<"vec3"> | null {
        const atmosphereContext = getAtmosphereContext(builder);

        const { worldToUnit } = atmosphereContext.parameters;
        const {
            camera,
            matrixWorldToECEF,
            matrixViewToECEF,
            sunDirectionECEF,
            moonDirectionECEF,
            cameraPositionUnit,
            altitudeCorrectionUnit
        } = atmosphereContext;

        const { _shadowLengthNode: shadowLengthNode } = this;

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

        const getRayDirectionECEF = Fn((): Node<"vec3"> => {
            switch (this.scope) {
                case CAMERA: {
                    return matrixViewToECEF
                        .mul(vec4(positionView, 0))
                        .xyz.toVarying("rayDirectionECEF")
                        .normalize();
                }
                case EQUIRECTANGULAR: {
                    const directionWorld = equirectToDirectionWorld(uv());
                    return matrixWorldToECEF
                        .mul(vec4(directionWorld, 0))
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
        });

        return Fn(() => {
            let { _cameraPositionUnit: cameraPositionUnit, _rayDirectionECEF: rayDirectionECEF } =
                this;
            cameraPositionUnit ??= getCameraPositionUnit().toConst();
            rayDirectionECEF ??= getRayDirectionECEF().toConst();

            const solarLuminanceTransfer = getIndirectLuminance(
                cameraPositionUnit.add(altitudeCorrectionUnit),
                rayDirectionECEF,
                shadowLengthNode ?? vec2(0),
                sunDirectionECEF
            ).toConst();
            const transmittance = solarLuminanceTransfer.get("transmittance");
            let inscattering = solarLuminanceTransfer.get("luminance");

            if (this.moonScattering) {
                const lunarLuminanceTransfer = getIndirectLuminance(
                    cameraPositionUnit.add(altitudeCorrectionUnit),
                    rayDirectionECEF,
                    shadowLengthNode ?? vec2(0),
                    moonDirectionECEF
                ).toConst();
                inscattering = inscattering.add(
                    lunarLuminanceTransfer.get("luminance").mul(2.5e-6)
                );
            }

            const luminance = (this._inputNode?.rgb ?? vec3(0)).toVar();

            if (this.showStars) {
                luminance.addAssign(this.starsNode);
            }

            if (this.showSun) {
                const { sunNode } = this;
                sunNode._rayDirectionECEF = rayDirectionECEF;
                luminance.assign(mix(luminance, sunNode.rgb, sunNode.a));
            }

            if (this.showMoon) {
                const { moonNode } = this;
                moonNode._rayDirectionECEF = rayDirectionECEF;
                luminance.assign(mix(luminance, moonNode.rgb, moonNode.a));
            }

            return luminance.mul(transmittance).add(inscattering);
        })();
    }
}

export const sky = /*#__PURE__*/ nodeProxy(SkyNode, CAMERA);
export const skyBackground = /*#__PURE__*/ nodeProxy(SkyNode, EQUIRECTANGULAR);
export const skyBackdrop = /*#__PURE__*/ nodeProxy(SkyNode, BACKDROP);
