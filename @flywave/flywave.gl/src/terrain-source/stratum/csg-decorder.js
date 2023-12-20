export const CSG_STRATUM_DECODER = "csg-stratum-decoder";
import CSGData from "./csg-data";
import * as THREE from "three";

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
            source: { position3DAndHeight, textureCoordAndEncodedNormals, indices, center }
        } = data;

        var buffer = new THREE.BufferGeometry();
        buffer.setAttribute("position", new THREE.BufferAttribute(position3DAndHeight, 3));

        var uv = new THREE.BufferAttribute(
            new Float32Array(textureCoordAndEncodedNormals.length / 2),
            2
        );
        for (var i = 0, j = 0; i < textureCoordAndEncodedNormals.length; i += 4, j += 2) {
            uv.array[j] = textureCoordAndEncodedNormals[j];
            uv.array[j + 1] = textureCoordAndEncodedNormals[j + 2];
        }
        buffer.setAttribute("uv", uv);

        var normal = new THREE.BufferAttribute(
            new Float32Array((textureCoordAndEncodedNormals.length / 4) * 3),
            3
        );
        for (var i = 0, j = 0; i < textureCoordAndEncodedNormals.length; i += 4, j += 2) {
            //todo decode normal
            var decode = textureCoordAndEncodedNormals[j + 3];
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

        target.forEach(target => {
            sourceCSG.union(new CSGData().fromJSON(target));
        });

        verityTile.csgData = sourceCSG.toJSON();
        return Promise.resolve(verityTile);
    }
}
