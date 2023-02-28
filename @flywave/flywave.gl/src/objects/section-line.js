import * as THREE from "three";

class SectionLine extends THREE.Object3D {
    constructor(path, section, materials, userData) {
        super();
        this.path = path;
        this.section = section;
        this.materials = materials;

        this.geometry = this.calculateGeometry(this.path, this.section);
        this.geometry.computeBoundingSphere();
        this.mesh = new THREE.Mesh(this.geometry, this.materials);

        this.mesh.userData = {
            ...userData
        };

        this.renderOrder = Number.MAX_SAFE_INTEGER;
        this.mesh.castShadow = true;
        this.mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        this.add(this.mesh);
    }

    updateGeometry(path, section) {
        this.path = path;
        this.section = section;

        var geometry = this.calculateGeometry(this.path, this.section);
        for (var attr in geometry.attributes) {
            this.geometry.attributes[attr].copy(geometry.attributes[attr]);
            this.geometry.attributes[attr].needsUpdate = true;
        }
        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingSphere(); 
    }

    updateMatrials(materials) {
        this.materials = materials;
        this.mesh.material = materials;
    }

    calculateGeometry(points, sectionPoints) {
        var spline = new THREE.CatmullRomCurve3(points);

        const shape = new THREE.Shape(sectionPoints);

        const extrudeSettings = {
            steps: 100,
            bevelEnabled: false,
            extrudePath: spline
        };

        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    };

}

export default SectionLine;