export const CSG_STRATUM_DECODER = "csg-stratum-decoder";
import CSGData from "./csg-data";
import * as THREE from "three";
import AttributeCompression from "../tin-terrain/quantized-mesh/attribute-compression";
import { mergeGeometries } from "../../loaders/BufferGeometryUtils";

export class CSGStratumTileDecoder {
    connect() {
        return Promise.resolve();
    }

    configure() {}

    decodeTile(data, tileKey, projection) {
        const verityTile = {
            techniques: [],
            geometries: [],
            csgData: null
        };
        const {
            target,
            source: {
                position3DAndHeight,
                textureCoordAndEncodedNormals,
                indices,
                center,
                stratumGroups
            }
        } = data;

        var buffer = new THREE.BufferGeometry();
        buffer.setAttribute("position", new THREE.BufferAttribute(position3DAndHeight, 3));

        var uv = new THREE.BufferAttribute(
            new Float32Array(textureCoordAndEncodedNormals.length / 2),
            2
        );
        for (var i = 0, j = 0; i < textureCoordAndEncodedNormals.length; i += 4, j += 2) {
            uv.array[j] = textureCoordAndEncodedNormals[i];
            uv.array[j + 1] = textureCoordAndEncodedNormals[i + 2];
        }
        buffer.setAttribute("uv", uv);

        var normal = new THREE.BufferAttribute(
            new Float32Array((textureCoordAndEncodedNormals.length / 4) * 3),
            3
        );
        for (var i = 0, j = 0; i < textureCoordAndEncodedNormals.length; i += 4, j += 3) {
            //todo decode normal
            var decode = AttributeCompression.octDecodeFloat(
                textureCoordAndEncodedNormals[i + 3],
                new THREE.Vector3()
            );
            normal.array[j] = decode.x;
            normal.array[j + 1] = decode.y;
            normal.array[j + 2] = decode.z;
        }
        buffer.setAttribute("normal", normal);

        buffer.setIndex(new THREE.BufferAttribute(indices, 1));

        var mesh = new THREE.Mesh(buffer);
        mesh.position.copy(center);
        var sourceCSG = new CSGData(mesh);

        if (!target) {
            target = [];
        }

        if (stratumGroups) {
            var groups = Object.values(stratumGroups);
            groups.pop();

            for (var { Start, End, Id } of groups) {
                buffer.addGroup(Start, End - Start);
            }
        }
        var geometry = sourceCSG.subtract(
            target.map(t => {
                return new CSGData().fromJSON(t);
            })
        );

        sourceCSG.mesh.geometry = geometry;
        if (sourceCSG.mesh.geometry) {
            // sourceCSG.mesh.geometry.groups.forEach((group, index) => {
            //     group.materialIndex = groupsIndex[index];
            // });

            verityTile.csgData = sourceCSG.encodeTextureUvNormal().toJSON();
        }
        return Promise.resolve(verityTile);
    }
}
