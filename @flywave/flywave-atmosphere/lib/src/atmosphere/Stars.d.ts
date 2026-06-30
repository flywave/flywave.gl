import { Sprite, type Camera, type Intersection, type Raycaster } from "three";
import { StarsNodeMaterial } from "./StarsNodeMaterial";
export declare class Stars extends Sprite {
    material: StarsNodeMaterial;
    frustumCulled: boolean;
    camera?: Camera;
    constructor(data?: string | ArrayBufferLike);
    raycast(raycaster: Raycaster, intersects: Intersection[]): void;
    updateMatrixWorld(force?: boolean): void;
    private createBuffers;
    dispose(): void;
}
