import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { CSG } from "three-csg-ts";
import AttributeCompression from "../tin-terrain/quantized-mesh/attribute-compression";

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
        const index = geometry.index;
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
        if (index)
            data.index = {
                itemSize: index.itemSize,
                array: index.array,
                normalized: index.normalized
            };
        return data;
    }

    encodeTextureUvNormal() {
        const {
            geometry: {
                attributes: { normal, uv }
            },
            geometry
        } = this.mesh;
        var n = new Vector3();
        var buffer = new Float32Array(normal.count * 4);
        for (var i = 0, j = 0; i < buffer.length; i += 4, j++) {
            buffer[i] = uv.array[j * 2];
            buffer[i + 1] = uv.array[j * 2 + 1];
            buffer[i + 2] = uv.array[j * 2 + 1];
            n.fromArray(normal.array, j * 3);
            buffer[i + 3] = AttributeCompression.octEncodeFloat(n);
        }

        geometry.deleteAttribute("normal");
        geometry.deleteAttribute("uv");

        geometry.setAttribute("textureCoordAndEncodedNormals", new BufferAttribute(buffer, 4));
        return this;
    }

    geometryFromJSON({ attributes, groups, index }) {
        var buffer = new BufferGeometry();

        for (const key in attributes) {
            const { itemSize, array, normalized } = attributes[key];
            buffer.setAttribute(key, new BufferAttribute(array, itemSize, normalized));
        }
        (groups || []).forEach(({ start, count, materialIndex }) => {
            buffer.addGroup(start, count, materialIndex);
        });
        {
            if (index) {
                const { itemSize, array, normalized } = index;
                buffer.setIndex(new BufferAttribute(array, itemSize, normalized));
            }
        }
        return buffer;
    }

    subtract(csgData) {
        this.mesh.updateMatrix();
        csgData.mesh.updateMatrix();
        return CSG.subtract(this.mesh, csgData.mesh);
    }

    union(csgData) {
        this.mesh.updateMatrix();
        csgData.mesh.updateMatrix();
        return CSG.union(this.mesh, csgData.mesh);
    }

    intersect(csgData) {
        this.mesh.updateMatrix();
        csgData.mesh.updateMatrix();
        return CSG.intersect(this.mesh, csgData.mesh);
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
