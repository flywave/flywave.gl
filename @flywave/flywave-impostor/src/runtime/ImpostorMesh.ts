// @ts-nocheck
import * as THREE from "three/webgpu";
import { createImpostorNodeMaterial } from "./ImpostorTSL";
import type { ImpostorData } from "../types";

export interface ImpostorMeshOptions {
    data: ImpostorData;
    atlasTexture: THREE.Texture;
}

export class ImpostorMesh extends THREE.Mesh {
    public camPosUniform: any;

    constructor(options: ImpostorMeshOptions) {
        const { data, atlasTexture } = options;

        atlasTexture.flipY = false;
        atlasTexture.minFilter = THREE.LinearFilter;
        atlasTexture.magFilter = THREE.LinearFilter;
        atlasTexture.needsUpdate = true;

        const { material, camPosUniform } = createImpostorNodeMaterial(atlasTexture, {
            frameSize: data.frames[0],
            scale: data.scale,
            aabbMax: data.aabbMax
        });

        super(new THREE.PlaneGeometry(1, 1), material);
        this.material = material;
        this.camPosUniform = camPosUniform;
        this.frustumCulled = false;
    }

    // Set camera position in object space each frame.
    // Standard three.js: call with camera.position in mesh local space,
    //   or just use the default - three.js auto-updates cameraPosition.
    // RTE: call with the direction from object to camera.
    updateCamPos(pos: THREE.Vector3) {
        this.camPosUniform.value.copy(pos);
    }

    dispose() {
        this.geometry.dispose();
        (this.material as THREE.Material).dispose();
    }
}
