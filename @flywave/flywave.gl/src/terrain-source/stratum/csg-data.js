import { BoxGeometry, BufferAttribute, BufferGeometry, Vector3 } from "three";
import { SUBTRACTION, ADDITION, INTERSECTION, Brush, Evaluator } from "three-bvh-csg";
import AttributeCompression from "../tin-terrain/quantized-mesh/attribute-compression";
import { mergeGeometries, toTrianglesDrawMode } from "../../loaders/BufferGeometryUtils";
import { TriangleStripDrawMode } from "three";
class CSGData {
    box = new THREE.Box3();

    constructor(mesh, samplePoints) {
        if (mesh) {
            this.mesh = mesh;
            this.id = mesh.uuid;
            this.box.setFromObject(mesh);
        }
        this.samplePoints = samplePoints;
    }

    updateBoundBox() {
        this.box = new THREE.Box3();
        return this.box.setFromObject(this.mesh);
    }

    get hash() {
        this.mesh.updateMatrix();
        return `${this.mesh.uuid}_${this.mesh.matrix.toArray().join(",")}`;
    }

    geometryToJSON(geometry) {
        if (!geometry) {
            return null;
        }
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
        var buffer = new Float32Array(normal ? normal.count * 4 : 0);
        for (var i = 0, j = 0; i < buffer.length; i += 4, j++) {
            buffer[i] = uv.array[j * 2];
            buffer[i + 1] = uv.array[j * 2 + 1];
            buffer[i + 2] = uv.array[j * 2 + 1];
            n.fromArray(normal.array, j * 3);
            n.normalize();
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

    splitGeometries() {
        const { groups, index, attributes } = this.mesh.geometry;
        var geometries = [];
        groups.forEach(group => {
            var buffer = new BufferGeometry();
            geometries.push(buffer);
            {
                let position = new THREE.BufferAttribute(new Float32Array(group.count * 3), 3);
                let normal = new THREE.BufferAttribute(new Float32Array(group.count * 3), 3);
                let uv = new THREE.BufferAttribute(new Float32Array(group.count * 2), 2);

                for (var i = group.start, j = 0; i < group.start + group.count; i++, j++) {
                    var _index = index.getX(i);
                    position.setX(j, attributes["position"].getX(_index));
                    position.setY(j, attributes["position"].getY(_index));
                    position.setZ(j, attributes["position"].getZ(_index));

                    normal.setX(j, attributes["normal"].getX(_index));
                    normal.setY(j, attributes["normal"].getY(_index));
                    normal.setZ(j, attributes["normal"].getZ(_index));

                    uv.setX(j, attributes["uv"].getX(_index));
                    uv.setY(j, attributes["uv"].getY(_index));
                }

                buffer.setAttribute("position", position);
                buffer.setAttribute("normal", normal);
                buffer.setAttribute("uv", uv);
            }
        });
        if (groups.length == 0) {
            geometries.push(this.mesh.geometry);
        }
        return geometries;
    }

    doCsg(csgDatas, operator) {
        var geometries = [];
        this.splitGeometries().forEach(source => {
            var a = new Brush(source);
            a.position.copy(this.mesh.position);
            a.quaternion.copy(this.mesh.quaternion);
            a.scale.copy(this.mesh.scale);
            a.updateMatrixWorld();

            const evaluator = new Evaluator();
            evaluator.useGroups = false;
            csgDatas.forEach(csgData => {
                var b = new Brush(csgData.mesh.geometry);
                b.position.copy(csgData.mesh.position);
                b.quaternion.copy(csgData.mesh.quaternion);
                b.scale.copy(csgData.mesh.scale);
                b.updateMatrixWorld();
                const { geometry } = evaluator.evaluate(a, b, operator);
                a.geometry = geometry;
                var p = a.position.clone().multiplyScalar(-1);
                geometry.translate(p.x, p.y, p.z);
            });
            a.geometry && geometries.push(a.geometry);
        });
        return geometries.length ? mergeGeometries(geometries, true) : null;
    }

    subtract(csgDatas) {
        return this.doCsg(csgDatas, SUBTRACTION);
    }

    union(csgDatas) {
        return this.doCsg(csgDatas, ADDITION);
    }

    intersect(csgDatas) {
        return this.doCsg(csgDatas, INTERSECTION);
    }

    toJSON() {
        return {
            position: this.mesh.position.toArray(),
            scale: this.mesh.scale.toArray(),
            quaternion: this.mesh.quaternion.toArray(),
            geometry: this.geometryToJSON(this.mesh.geometry),
            samplePoints: this.samplePoints,
            id: this.id
        };
    }

    fromJSON({ position, scale, quaternion, geometry, id, samplePoints }) {
        this.mesh = new THREE.Mesh(this.geometryFromJSON(geometry));
        this.mesh.position.fromArray(position);
        this.mesh.scale.fromArray(scale);
        this.mesh.quaternion.fromArray(quaternion);
        this.box.setFromObject(this.mesh);
        this.samplePoints = samplePoints;
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
