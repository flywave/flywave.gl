/* Copyright (C) 2025 flywave.gl contributors */
import { FileLoader, InstancedBufferAttribute, Sprite } from "three";
import { DEFAULT_STARS_DATA_URL } from "../constants";
import { StarsNodeMaterial } from "./StarsNodeMaterial";
export class Stars extends Sprite {
    constructor(data = DEFAULT_STARS_DATA_URL) {
        super();
        this.material = new StarsNodeMaterial();
        this.frustumCulled = false;
        if (typeof data === "string") {
            new FileLoader()
                .setResponseType("arraybuffer")
                .loadAsync(data)
                .then(data => {
                this.createBuffers(data);
            })
                .catch((error) => {
                console.error(error);
            });
        }
        else {
            this.createBuffers(data);
        }
    }
    // Disable raycasting, which confuses GlobeControls:
    raycast(raycaster, intersects) { }
    updateMatrixWorld(force) {
        const { camera } = this;
        if (camera != null) {
            this.position.copy(camera.position);
        }
        super.updateMatrixWorld(force);
    }
    createBuffers(data) {
        // Byte 0-5: int16 position (x, y, z)
        // Byte 6: uint8 magnitude
        // Byte 7-9: uint8 color (r, g, b)
        const count = data.byteLength / 10;
        const positions = new Float32Array(count * 3);
        const magnitudes = new Float32Array(count);
        const colors = new Float32Array(count * 3);
        // As of r180, instancedBufferAttribute doesn't support buffers other than
        // floating-point types. Manually normalize the values here.
        const shorts = new Int16Array(data);
        const bytes = new Uint8Array(data);
        for (let index = 0, vec3Index = 0, shortIndex = 0, byteIndex = 0; index < count; ++index, vec3Index += 3, shortIndex += 5, byteIndex += 10) {
            positions[vec3Index + 0] = shorts[shortIndex + 0] / 0x7fff;
            positions[vec3Index + 1] = shorts[shortIndex + 1] / 0x7fff;
            positions[vec3Index + 2] = shorts[shortIndex + 2] / 0x7fff;
            magnitudes[index] = bytes[byteIndex + 6] / 0xff;
            colors[vec3Index + 0] = bytes[byteIndex + 7] / 0xff;
            colors[vec3Index + 1] = bytes[byteIndex + 8] / 0xff;
            colors[vec3Index + 2] = bytes[byteIndex + 9] / 0xff;
        }
        const { material } = this;
        material.name = "Stars";
        material.positionBuffer = new InstancedBufferAttribute(positions, 3);
        material.magnitudeBuffer = new InstancedBufferAttribute(magnitudes, 1);
        material.colorBuffer = new InstancedBufferAttribute(colors, 3);
        material.needsUpdate = true;
        this.count = count;
    }
    dispose() {
        this.material.dispose();
    }
}
//# sourceMappingURL=Stars.js.map