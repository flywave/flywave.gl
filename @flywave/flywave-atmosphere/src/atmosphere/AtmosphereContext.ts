// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Vector2, Vector3, type Camera } from "three";
import { renderGroup, uniform } from "three/tsl";
import { NodeBuilder, type Renderer } from "three/webgpu";

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
                return;
            }
            value.setScalar(0);
        });

    cameraHeight: any = uniform(0)
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
