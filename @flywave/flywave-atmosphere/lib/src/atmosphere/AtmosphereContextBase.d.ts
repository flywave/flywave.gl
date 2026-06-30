import { NodeBuilder, type Renderer } from "three/webgpu";
import type { Node, NodeType } from "../tsl/node";
import type { AtmosphereParameters } from "./AtmosphereParameters";
export declare const densityProfileLayerStruct: import("three/src/nodes/TSL.js").Struct;
export declare const densityProfileStruct: import("three/src/nodes/TSL.js").Struct;
declare const atmosphereParametersLayout: {
    worldToUnit: string;
    solarIrradiance: string;
    sunAngularRadius: string;
    bottomRadius: string;
    topRadius: string;
    rayleighDensity: string;
    rayleighScattering: string;
    mieDensity: string;
    mieScattering: string;
    mieExtinction: string;
    miePhaseFunctionG: string;
    absorptionDensity: string;
    absorptionExtinction: string;
    groundAlbedo: string;
    minCosLight: string;
    sunRadianceToLuminance: string;
    skyRadianceToLuminance: string;
    luminanceScale: string;
    transmittanceTextureSize: string;
    irradianceTextureSize: string;
    multipleScatteringTextureSize: string;
    scatteringTextureRadiusSize: string;
    scatteringTextureCosViewSize: string;
    scatteringTextureCosLightSize: string;
    scatteringTextureCosViewLightSize: string;
};
export declare const atmosphereParametersStruct: import("three/src/nodes/TSL.js").Struct;
type AtmosphereParametersFields = {
    [K in keyof typeof atmosphereParametersLayout]: (typeof atmosphereParametersLayout)[K] extends NodeType ? Node<(typeof atmosphereParametersLayout)[K]> : Node;
};
export declare function makeDestructible(node: Node): Node & AtmosphereParametersFields;
export declare class AtmosphereContextBase {
    readonly parameters: AtmosphereParameters;
    readonly parametersNode: Node & AtmosphereParametersFields;
    constructor(parameters: AtmosphereParameters);
    dispose(): void;
}
export declare function getAtmosphereContextBase(host: NodeBuilder | Renderer): AtmosphereContextBase;
export {};
