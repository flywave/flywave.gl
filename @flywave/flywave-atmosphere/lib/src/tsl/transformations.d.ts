export declare const depthToViewZ: (depth: unknown, camera: unknown, near?: unknown, far?: unknown) => import("three/webgpu").Node;
export declare const logarithmicToPerspectiveDepth: (depth: any, near?: import("three/webgpu").UniformNode<"float", number>, far?: import("three/webgpu").UniformNode<"float", number>) => import("three/webgpu").Node<"float">;
export declare const perspectiveToLogarithmicDepth: (depth: any, near?: import("three/webgpu").UniformNode<"float", number>, far?: import("three/webgpu").UniformNode<"float", number>) => import("three/webgpu").Node<"float">;
export declare const screenToPositionView: (uv: any, depth: any, viewZ: any, projectionMatrix: any, inverseProjectionMatrix: any) => any;
export declare const equirectToDirectionWorld: import("./FnLayout").ShaderFn<readonly unknown[]>;
