// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { Matrix3 } from "three";
import { normalView, positionView, renderGroup, uniform, vec4 } from "three/tsl";
import { AnalyticLightNode, NodeUpdateType } from "three/webgpu";
import { getAtmosphereContext } from "./AtmosphereContext";
import { getTransmittanceToSun } from "./common";
import { getIndirectIlluminance } from "./runtime";
const rotationScratch = /*#__PURE__*/ new Matrix3();
export class AtmosphereLightNode extends AnalyticLightNode {
    static get type() {
        return "AtmosphereLightNode";
    }
    constructor(light) {
        super(light);
        this.intensity = uniform(1).setGroup(renderGroup);
        this.directionECEF = uniform("vec3").setGroup(renderGroup);
        this.updateBeforeType = NodeUpdateType.FRAME;
    }
    updateBefore(frame) {
        const { light, atmosphereContext } = this;
        if (light == null || atmosphereContext == null) {
            return;
        }
        const { matrixWorldToECEF } = atmosphereContext;
        light.position
            .copy(this.directionECEF.value)
            .applyMatrix3(
        // WORKAROUND: We cannot use matrixECEFToWorld here because nothing uses
        // it in the node graph, therefore it is not updated.
        rotationScratch.setFromMatrix4(matrixWorldToECEF.value).transpose())
            .multiplyScalar(light.distance)
            .add(light.target.position);
    }
    update(frame) {
        super.update(frame);
        const { light, atmosphereContext } = this;
        if (light == null || atmosphereContext == null) {
            return;
        }
        switch (light.body) {
            case "sun":
                this.intensity.value = light.intensity;
                this.directionECEF.value.copy(atmosphereContext.sunDirectionECEF.value);
                break;
            case "moon":
                this.intensity.value = light.intensity * 2.5e-6; // TODO: Consider moon phase
                this.directionECEF.value.copy(atmosphereContext.moonDirectionECEF.value);
                break;
        }
    }
    setup(builder) {
        this.atmosphereContext = getAtmosphereContext(builder);
        return super.setup(builder);
    }
    setupDirect(builder) {
        const { light, atmosphereContext } = this;
        if (light == null || atmosphereContext == null) {
            return;
        }
        const { intensity, directionECEF } = this;
        const { direct, indirect } = light;
        const { worldToUnit, solarIrradiance, sunRadianceToLuminance, luminanceScale } = atmosphereContext.parametersNode;
        const { matrixViewToECEF, matrixECEFToView, altitudeCorrectionECEF } = atmosphereContext;
        // Derive the ECEF normal vector and the unit-space position of the vertex.
        const normalECEF = matrixViewToECEF.mul(vec4(normalView, 0)).xyz;
        let positionECEF = matrixViewToECEF.mul(vec4(positionView, 1)).xyz;
        if (atmosphereContext.correctAltitude) {
            positionECEF = positionECEF.add(altitudeCorrectionECEF);
        }
        const positionUnit = positionECEF.mul(worldToUnit).toConst();
        // Compute the indirect illuminance to store it in the context.
        const indirectIlluminance = getIndirectIlluminance(positionUnit, normalECEF, directionECEF).mul(indirect.select(1, 0).uniformFlow());
        // Yes, it's an indirect but should be fine to update it here.
        const lightingContext = builder.context;
        lightingContext.irradiance.addAssign(indirectIlluminance.mul(intensity));
        // Derive the view-space light direction.
        const directionView = matrixECEFToView.mul(vec4(directionECEF, 0)).xyz;
        // Compute the direct luminance of the light.
        // Fortunately, the apparent sizes of the sun and moon are close, we use
        // the result of getTransmittanceToSun for the moon as well.
        const radius = positionUnit.length().toConst();
        const cosLight = positionUnit.dot(directionECEF).div(radius);
        const transmittance = getTransmittanceToSun(atmosphereContext.lutNode.getTextureNode("transmittance"), radius, cosLight);
        const directLuminance = solarIrradiance
            .mul(transmittance)
            .mul(sunRadianceToLuminance.mul(luminanceScale))
            .mul(intensity)
            .mul(direct.select(1, 0).uniformFlow());
        return {
            lightDirection: directionView,
            lightColor: directLuminance.mul(this.colorNode)
        };
    }
}
//# sourceMappingURL=AtmosphereLightNode.js.map