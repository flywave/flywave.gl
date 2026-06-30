// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { Vector2, Vector3 } from "three";
import { renderGroup, uniform } from "three/tsl";
import { NodeBuilder } from "three/webgpu";
import { AtmosphereContextBase } from "./AtmosphereContextBase";
import { AtmosphereLUTNode } from "./AtmosphereLUTNode";
import { AtmosphereParameters } from "./AtmosphereParameters";
const vectorScratch = /*#__PURE__*/ new Vector3();
export class AtmosphereContext extends AtmosphereContextBase {
    constructor(parameters = new AtmosphereParameters(), lutNode = new AtmosphereLUTNode(parameters)) {
        super(parameters);
        this.matrixWorldToECEF = uniform("mat4").setGroup(renderGroup).setName("matrixWorldToECEF");
        this.matrixECIToECEF = uniform("mat4").setGroup(renderGroup).setName("matrixECIToECEF");
        this.sunDirectionECEF = uniform("vec3").setGroup(renderGroup).setName("sunDirectionECEF");
        this.moonDirectionECEF = uniform("vec3").setGroup(renderGroup).setName("moonDirectionECEF");
        this.matrixMoonFixedToECEF = uniform("mat4").setGroup(renderGroup).setName("matrixMoonFixedToECEF");
        this.scatteringSampleCount = uniform(new Vector2(4, 14))
            .setGroup(renderGroup)
            .setName("scatteringSampleCount");
        this.matrixViewToECEF = uniform("mat4")
            .setGroup(renderGroup)
            .setName("matrixViewToECEF")
            .onRenderUpdate((frame, { value }) => {
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            value.multiplyMatrices(this.matrixWorldToECEF.value, camera.matrixWorld);
        });
        this.matrixECEFToWorld = uniform("mat4")
            .setGroup(renderGroup)
            .setName("matrixECEFToWorld")
            .onRenderUpdate((_, { value }) => {
            value.copy(this.matrixWorldToECEF.value).invert();
        });
        this.matrixECEFToView = uniform("mat4")
            .setGroup(renderGroup)
            .setName("matrixECEFToView")
            .onRenderUpdate((frame, { value }) => {
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            value.multiplyMatrices(camera.matrixWorldInverse, value.copy(this.matrixWorldToECEF.value).invert());
        });
        this.cameraPositionECEF = uniform("vec3")
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
        this.altitudeCorrectionECEF = uniform("vec3")
            .setGroup(renderGroup)
            .setName("altitudeCorrectionECEF")
            .onRenderUpdate((frame, { value }) => {
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            value.setScalar(0);
        });
        this.cameraHeight = uniform(0)
            .setGroup(renderGroup)
            .setName("cameraHeight")
            .onRenderUpdate((frame, self) => {
            if (this._overrideCameraPositionECEF != null) {
                const pos = this._overrideCameraPositionECEF;
                self.value = pos.length() - this.parameters.bottomRadius;
                return;
            }
            const camera = this.camera ?? frame.camera;
            if (camera == null) {
                return;
            }
            const positionECEF = vectorScratch
                .setFromMatrixPosition(camera.matrixWorld)
                .applyMatrix4(this.matrixWorldToECEF.value);
            self.value = positionECEF.length() - this.parameters.bottomRadius;
        });
        this.cameraPositionUnit = this.cameraPositionECEF
            .mul(this.parametersNode.worldToUnit)
            .toVar("cameraPositionUnit"); // BUG: Cannot use toConst() here
        this.altitudeCorrectionUnit = this.altitudeCorrectionECEF
            .mul(this.parametersNode.worldToUnit)
            .toVar("altitudeCorrectionUnit"); // BUG: Cannot use toConst() here
        this.ellipsoidRadius = 6378137;
        this.correctAltitude = true;
        this.constrainCamera = true;
        this.showGround = true;
        this.accurateShadowScattering = true;
        this.raymarchScattering = true;
        this.lutNode = lutNode;
    }
    dispose() {
        this.lutNode.dispose();
        super.dispose();
    }
}
/** @deprecated Use AtmosphereContext instead. */
export const AtmosphereContextNode = AtmosphereContext;
let fallbackContext;
export function registerAtmosphereContext(context) {
    fallbackContext = context;
}
export function getAtmosphereContext(host) {
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
//# sourceMappingURL=AtmosphereContext.js.map