import * as THREE from "three";
interface DracoSchema {
    attributes: {
        [name: string]: THREE.BufferAttribute;
    };
    index?: THREE.BufferAttribute;
    metadata: Record<string, any>;
}
export declare function getDracoSchema(geometry: THREE.BufferGeometry, loaderData: any): DracoSchema;
export {};
//# sourceMappingURL=get-draco-schema.d.ts.map