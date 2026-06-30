import { DirectionalLight } from "three";
export type AtmosphereLightBody = "sun" | "moon";
export declare class AtmosphereLight extends DirectionalLight {
    readonly type = "AtmosphereLight";
    distance: number;
    body: AtmosphereLightBody;
    direct: import("three/webgpu").UniformNode<"bool", boolean>;
    indirect: import("three/webgpu").UniformNode<"bool", boolean>;
    constructor(distance?: number, body?: AtmosphereLightBody);
}
