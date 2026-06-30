// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { Fn, mix, nodeProxy, positionView, uv, vec2, vec3, vec4 } from "three/tsl";
import { TempNode } from "three/webgpu";
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
export class SkyNode extends TempNode {
    static get type() {
        return "SkyNode";
    }
    constructor(scope, shadowLengthNode = null) {
        super("vec3");
        this.inputNode = null;
        this.cameraPositionUnit = null;
        this.rayDirectionECEF = null;
        this.showSun = true;
        this.showMoon = true;
        this.showStars = false;
        this.moonScattering = false;
        this.scope = scope;
        this.shadowLengthNode = shadowLengthNode;
        this.sunNode = new SunNode();
        this.moonNode = new MoonNode();
        this.starsNode = new StarsNode();
    }
    customCacheKey() {
        return hashValues(this.showSun, this.showMoon, this.showStars, this.moonScattering);
    }
    setup(builder) {
        const atmosphereContext = getAtmosphereContext(builder);
        const { worldToUnit } = atmosphereContext.parameters;
        const { camera, matrixWorldToECEF, matrixViewToECEF, sunDirectionECEF, moonDirectionECEF, cameraPositionUnit, altitudeCorrectionUnit } = atmosphereContext;
        const { shadowLengthNode } = this;
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
        const getRayDirectionECEF = Fn(() => {
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
            let { cameraPositionUnit, rayDirectionECEF } = this;
            cameraPositionUnit ?? (cameraPositionUnit = getCameraPositionUnit().toConst());
            rayDirectionECEF ?? (rayDirectionECEF = getRayDirectionECEF().toConst());
            const solarLuminanceTransfer = getIndirectLuminance(cameraPositionUnit.add(altitudeCorrectionUnit), rayDirectionECEF, shadowLengthNode ?? vec2(0), sunDirectionECEF).toConst();
            const transmittance = solarLuminanceTransfer.get("transmittance");
            let inscattering = solarLuminanceTransfer.get("luminance");
            if (this.moonScattering) {
                const lunarLuminanceTransfer = getIndirectLuminance(cameraPositionUnit.add(altitudeCorrectionUnit), rayDirectionECEF, shadowLengthNode ?? vec2(0), moonDirectionECEF).toConst();
                inscattering = inscattering.add(lunarLuminanceTransfer.get("luminance").mul(2.5e-6));
            }
            const luminance = (this.inputNode?.rgb ?? vec3(0)).toVar();
            if (this.showStars) {
                luminance.addAssign(this.starsNode);
            }
            if (this.showSun) {
                const { sunNode } = this;
                sunNode.rayDirectionECEF = rayDirectionECEF;
                luminance.assign(mix(luminance, sunNode.rgb, sunNode.a));
            }
            if (this.showMoon) {
                const { moonNode } = this;
                moonNode.rayDirectionECEF = rayDirectionECEF;
                luminance.assign(mix(luminance, moonNode.rgb, moonNode.a));
            }
            return luminance.mul(transmittance).add(inscattering);
        })();
    }
}
export const sky = /*#__PURE__*/ nodeProxy(SkyNode, CAMERA);
export const skyBackground = /*#__PURE__*/ nodeProxy(SkyNode, EQUIRECTANGULAR);
export const skyBackdrop = /*#__PURE__*/ nodeProxy(SkyNode, BACKDROP);
//# sourceMappingURL=SkyNode.js.map