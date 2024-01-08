export const CSG_STRATUM_DECODER = "csg-stratum-decoder";
import CSGData from "./csg-data";
import * as THREE from "three";
import AttributeCompression from "../tin-terrain/quantized-mesh/attribute-compression";
import renderHeightMap, {
    offScreenCanvasManagerRender
} from "../tin-terrain/quantized-mesh/render-heightmap";

export class CSGStratumTileDecoder {
    constructor() {
        this.configurePromise = new Promise((reslove, reject) => {
            this._reslove = reslove;
            this._reject = reject;
        });
    }

    connect() {
        return Promise.resolve();
    }

    configure({ options }) {
        offScreenCanvasManagerRender.addOffScreenCanvas(
            options.offScreenCanvasId,
            options.offScreenCanvas
        );

        this.offScreenCanvasId = options.offScreenCanvasId;
        this._reslove();
    }

    decodeTile(data, tileKey, projection) {
        return this.configurePromise.then(() => {
            const verityTile = {
                techniques: [],
                geometries: [],
                csgData: null
            };
            const {
                geoBox,
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
                // groups.pop();

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
                verityTile.csgData = sourceCSG.encodeTextureUvNormal().toJSON();
            }

            // render hightmap

            var { position } = sourceCSG.mesh;
            var tempV = new THREE.Vector3();
            const attrPosition = geometry.getAttribute("position");
            var geocoordinates = new Float32Array(attrPosition.count * 3);
            var maximumHeight = Number.MIN_SAFE_INTEGER;
            var minimumHeight = Number.MAX_SAFE_INTEGER;
            for (var i = 0; i < attrPosition.count; i++) {
                tempV
                    .set(attrPosition.getX(i), attrPosition.getY(i), attrPosition.getZ(i))
                    .add(position);
                var { longitude, latitude, altitude } = projection.unprojectPoint(tempV);
                var index = i * 3;
                geocoordinates[index] = longitude;
                geocoordinates[index + 1] = latitude;
                geocoordinates[index + 2] = altitude;
                maximumHeight = Math.max(maximumHeight, altitude);
                minimumHeight = Math.min(minimumHeight, altitude);
            }

            geoBox[0] = (geoBox[0] * Math.PI) / 180;
            geoBox[1] = (geoBox[1] * Math.PI) / 180;
            geoBox[2] = minimumHeight;
            geoBox[3] = (geoBox[3] * Math.PI) / 180;
            geoBox[4] = (geoBox[4] * Math.PI) / 180;
            geoBox[5] = maximumHeight;
            verityTile.hightBuffer = {
                maximumHeight,
                minimumHeight,
                buffer: renderHeightMap(
                    this.offScreenCanvasId,
                    geoBox,
                    geocoordinates,
                    geometry.index ? geometry.index.array : null
                )
            };

            return Promise.resolve(verityTile);
        });
    }
}
