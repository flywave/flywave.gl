import * as THREE from "three";
/** Extract an arrow-like schema from a Draco mesh */
interface DracoSchema {
    attributes: {
        [name: string]: THREE.BufferAttribute;
    };
    index?: THREE.BufferAttribute;
    metadata: Record<string, any>;
}
export declare function getDracoSchema(geometry: THREE.BufferGeometry, loaderData: any): DracoSchema;
export {};
