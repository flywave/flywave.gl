import type { DirectLightData } from "three/src/nodes/TSL.js";
import { AnalyticLightNode, type NodeBuilder, type NodeFrame } from "three/webgpu";
import type { AtmosphereLight } from "./AtmosphereLight";
export declare class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
    static get type(): string;
    private atmosphereContext?;
    private readonly intensity;
    private readonly directionECEF;
    constructor(light?: AtmosphereLight | null);
    updateBefore(frame: NodeFrame): void;
    update(frame: NodeFrame): void;
    setup(builder: NodeBuilder): unknown;
    setupDirect(builder: NodeBuilder): DirectLightData | undefined;
}
