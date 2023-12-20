import { BufferAttribute, BufferGeometry } from "three";
import { CSG } from "three-csg-ts";

class CSGData {
    box = new THREE.Box3();

    constructor(mesh) {
        if (mesh) {
            this.mesh = mesh;
            this.id = mesh.uuid;
            this.box.setFromObject(mesh);
        }
    }

    get hash() {
        this.mesh.updateMatrix();
        return `${this.mesh.uuid}_${this.mesh.matrix.toArray().join(",")}`;
    }

    geometryToJSON(geometry) {
        var data = { attributes: {} };
        const attributes = geometry.attributes;
        for (const key in attributes) {
            const attribute = attributes[key];

            data.attributes[key] = {
                itemSize: attribute.itemSize,
                array: attribute.array,
                normalized: attribute.normalized
            };
        }
        const groups = geometry.groups;

        if (groups.length > 0) {
            data.groups = JSON.parse(JSON.stringify(groups));
        }
        return data;
    }

    geometryFromJSON({ attributes, groups }) {
        var buffer = new BufferGeometry();

        for (const key in attributes) {
            const { itemSize, array, normalized } = attributes[key];
            buffer.setAttribute(key, new BufferAttribute(array, itemSize, normalized));
        }
        (groups||[]).forEach(({ start, count, materialIndex }) => {
            buffer.addGroup(start, count, materialIndex);
        });
        return buffer;
    }

    subtract(csgData) {
        this.mesh.updateMatrix();
        csgData.mesh.updateMatrix();
        this.mesh = CSG.subtract(this.mesh, csgData.mesh);
        return this;
    }

    union(csgData) {
        this.mesh.updateMatrix();
        csgData.mesh.updateMatrix();
        this.mesh = CSG.union(this.mesh, csgData.mesh);
        return this;
    }

    intersect(csgData) {
        this.mesh.updateMatrix();
        csgData.mesh.updateMatrix();
        this.mesh = CSG.intersect(this.mesh, csgData.mesh);
        return this;
    }

    toJSON() {
        return {
            position: this.mesh.position.toArray(),
            scale: this.mesh.scale.toArray(),
            quaternion: this.mesh.quaternion.toArray(),
            geometry: this.geometryToJSON(this.mesh.geometry),
            id: this.id
        };
    }

    fromJSON({ position, scale, quaternion, geometry, id }) {
        this.mesh = new THREE.Mesh(this.geometryFromJSON(geometry));
        this.mesh.position.fromArray(position);
        this.mesh.scale.fromArray(scale);
        this.mesh.quaternion.fromArray(quaternion);
        this.box.setFromObject(this.mesh);
        this.id = id;
        return this;
    }

    _v = 0;
    set needsUpdate(v) {
        if (v) this._v++;
    }

    get version() {
        return this._v;
    }
}

export default CSGData;
