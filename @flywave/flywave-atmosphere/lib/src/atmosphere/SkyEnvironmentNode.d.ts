import { TempNode, type NodeBuilder, type NodeFrame } from "three/webgpu";
import { type SkyNode } from "./SkyNode";
export declare class SkyEnvironmentNode extends TempNode {
    static get type(): string;
    skyNode: SkyNode;
    distanceThreshold: number;
    angularThreshold: number;
    private readonly renderTarget;
    private readonly cubeCamera;
    private readonly material;
    private readonly mesh;
    private readonly pmremNode;
    private currentVersion?;
    private readonly prevCameraPosition;
    private readonly prevSunDirection;
    private readonly prevMoonDirection;
    private removeLUTUpdate?;
    constructor(size?: number);
    updateBefore({ renderer }: NodeFrame): void;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
export declare const skyEnvironment: (...args: ConstructorParameters<typeof SkyEnvironmentNode>) => SkyEnvironmentNode;
