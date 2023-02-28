import * as THREE from "three";

class LineAnchors extends THREE.Object3D {
    constructor(linestring) {
        super(); 
        this.mesh = new THREE.Mesh(this.geometry, material);
    }
}

export { LineAnchors };