import { Vector2, Vector3, type Camera } from "three";
import { NodeBuilder, type Renderer } from "three/webgpu";
import { AtmosphereContextBase } from "./AtmosphereContextBase";
import { AtmosphereLUTNode } from "./AtmosphereLUTNode";
import { AtmosphereParameters } from "./AtmosphereParameters";
export declare class AtmosphereContext extends AtmosphereContextBase {
    lutNode: AtmosphereLUTNode;
    matrixWorldToECEF: import("three/webgpu").UniformNode<"float", number>;
    matrixECIToECEF: import("three/webgpu").UniformNode<"float", number>;
    sunDirectionECEF: import("three/webgpu").UniformNode<"float", number>;
    moonDirectionECEF: import("three/webgpu").UniformNode<"float", number>;
    matrixMoonFixedToECEF: import("three/webgpu").UniformNode<"float", number>;
    scatteringSampleCount: import("three/webgpu").UniformNode<"vec2", Vector2>;
    matrixViewToECEF: import("three/webgpu").UniformNode<"float", number>;
    matrixECEFToWorld: import("three/webgpu").UniformNode<"float", number>;
    matrixECEFToView: import("three/webgpu").UniformNode<"float", number>;
    cameraPositionECEF: import("three/webgpu").UniformNode<"float", number>;
    altitudeCorrectionECEF: import("three/webgpu").UniformNode<"float", number>;
    cameraHeight: import("three/webgpu").UniformNode<"float", number>;
    cameraPositionUnit: any;
    altitudeCorrectionUnit: any;
    camera?: Camera;
    _overrideCameraPositionECEF?: Vector3 | null;
    ellipsoidRadius: number;
    correctAltitude: boolean;
    constrainCamera: boolean;
    showGround: boolean;
    accurateShadowScattering: boolean;
    raymarchScattering: boolean;
    constructor(parameters?: AtmosphereParameters, lutNode?: AtmosphereLUTNode);
    dispose(): void;
}
/** @deprecated Use AtmosphereContext instead. */
export declare const AtmosphereContextNode: typeof AtmosphereContext;
export declare function registerAtmosphereContext(context: AtmosphereContext): void;
export declare function getAtmosphereContext(host: NodeBuilder | Renderer): AtmosphereContext;
