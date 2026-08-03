import * as THREE from "three";

export function sphereOcta(coord: THREE.Vector2): THREE.Vector3 {
    const c = coord.clone().multiplyScalar(2.0).subScalar(1.0);
    const position = new THREE.Vector3(c.x, 0, c.y);
    const absX = Math.abs(position.x);
    const absZ = Math.abs(position.z);
    position.y = 1.0 - absX - absZ;
    if (position.y < 0) {
        position.x = Math.sign(position.x) * (1.0 - absZ);
        position.z = Math.sign(position.z) * (1.0 - absX);
    }
    return position;
}

export function hemisphereOcta(coord: THREE.Vector2): THREE.Vector3 {
    const position = new THREE.Vector3(coord.x - coord.y, 0, -1.0 + coord.x + coord.y);
    const absX = Math.abs(position.x);
    const absZ = Math.abs(position.z);
    position.y = 1.0 - absX - absZ;
    return position;
}

export function octaUvToWorld(coord: THREE.Vector2, isFullSphere: boolean): THREE.Vector3 {
    if (isFullSphere) {
        return sphereOcta(coord).normalize();
    }
    return hemisphereOcta(coord).normalize();
}

export function vecToSphereOct(vec: THREE.Vector3): THREE.Vector2 {
    const octant = new THREE.Vector3(Math.sign(vec.x), Math.sign(vec.y), Math.sign(vec.z));
    const sum = vec.dot(octant);
    const octahedron = vec.clone().divideScalar(sum);
    if (octahedron.y < 0) {
        const absX = Math.abs(octahedron.x);
        const absZ = Math.abs(octahedron.z);
        octahedron.x = octant.x * (1.0 - absZ);
        octahedron.z = octant.z * (1.0 - absX);
    }
    return new THREE.Vector2(octahedron.x, octahedron.z);
}

export function vecToHemisphereOct(vec: THREE.Vector3): THREE.Vector2 {
    const v = vec.clone();
    v.y = Math.max(v.y, 0.001);
    v.normalize();
    const octant = new THREE.Vector3(Math.sign(v.x), Math.sign(v.y), Math.sign(v.z));
    const sum = v.dot(octant);
    const octahedron = v.clone().divideScalar(sum);
    return new THREE.Vector2(octahedron.x + octahedron.z, octahedron.z - octahedron.x);
}

export function vectorToGrid(vec: THREE.Vector3, isFullSphere: boolean): THREE.Vector2 {
    if (isFullSphere) {
        return vecToSphereOct(vec);
    }
    return vecToHemisphereOct(vec);
}

export function frameXYToRay(
    frame: THREE.Vector2,
    frameCountMinusOne: THREE.Vector2
): THREE.Vector3 {
    const f = frame.clone().divide(frameCountMinusOne);
    const vec = sphereOcta(f);
    vec.normalize();
    return vec;
}

export function computeFrameDirections(frameSize: number, isFullSphere: boolean): THREE.Vector3[] {
    const directions: THREE.Vector3[] = [];
    const framesMinusOne = frameSize - 1;
    for (let y = 0; y < frameSize; y++) {
        for (let x = 0; x < frameSize; x++) {
            const uv = new THREE.Vector2(x / framesMinusOne, y / framesMinusOne);
            directions.push(octaUvToWorld(uv, isFullSphere));
        }
    }
    return directions;
}
