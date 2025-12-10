/* Copyright (C) 2025 flywave.gl contributors */

// QuantizedMeshClipper.ts
import {
    type Projection,
    ConvertWebMercatorY,
    GeoBox,
    GeoCoordinates
} from "@flywave/flywave-geoutils";
import {
    type BufferGeometry,
    BufferAttribute,
    Group,
    MathUtils,
    Mesh,
    Vector2,
    Vector3
} from "three";

import {
    type SerializedGroundModificationPolygon,
    GroundModificationPolygon
} from "../../ground-modification-manager";
import { type ClippedData, GeometryClipper, hashVertex, SplitOperation } from "./GeometryClipper";
import { QuantizedTerrainMesh } from "./QuantizedTerrainMesh";

const _cart: { lat?: number; lon?: number; height?: number } = {};
const _vec: Vector3 = /* @__PURE__ */ new Vector3();
const _pos0: Vector3 = /* @__PURE__ */ new Vector3();
const _pos1: Vector3 = /* @__PURE__ */ new Vector3();
const _pos2: Vector3 = /* @__PURE__ */ new Vector3();
const _pos3: Vector3 = /* @__PURE__ */ new Vector3();
const _temp: Vector3 = /* @__PURE__ */ new Vector3();
const _temp2: Vector3 = /* @__PURE__ */ new Vector3();

const _uv0: Vector2 = /* @__PURE__ */ new Vector2();
const _uv1: Vector2 = /* @__PURE__ */ new Vector2();
const _uv2: Vector2 = /* @__PURE__ */ new Vector2();

export interface QuantizedMeshClipperOptions {
    projection: Projection;
    skirtHeight?: number;
    smoothSkirtNormals?: boolean;
    isWebMercator?: boolean;
    solid?: boolean;
    geoBox: GeoBox;
    targetGeoBox: GeoBox;
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
    elevationMapEnabled: boolean;
    elevationMapFlipY: boolean;
}

export class QuantizedMeshClipper extends GeometryClipper {
    ellipsoid: Projection;
    skirtLength: number;
    smoothSkirtNormals: boolean;
    isWebMercator?: boolean;
    solid: boolean;

    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;

    declare attributeList: string[];

    constructor(options: QuantizedMeshClipperOptions) {
        super();
        this.ellipsoid = options.projection;
        this.skirtLength = options.skirtHeight || 1000;
        this.smoothSkirtNormals = options.smoothSkirtNormals || true;
        this.solid = options.solid || false;

        const { south, west, north, east } = options.geoBox;
        this.isWebMercator = options.isWebMercator;

        // set the range of the tile
        this.minLat = MathUtils.degToRad(south);
        this.maxLat = MathUtils.degToRad(north);
        this.minLon = MathUtils.degToRad(west);
        this.maxLon = MathUtils.degToRad(east);

        this.attributeList = ["position", "normal", "uv"];
    }

    clipToQuadrant(
        quantizedTerrainMesh: QuantizedTerrainMesh,
        left: boolean,
        bottom: boolean
    ): QuantizedTerrainMesh {
        const { solid, skirtLength, ellipsoid, smoothSkirtNormals } = this;

        const clipBox = new GeoBox(
            GeoCoordinates.fromRadians(
                bottom ? this.minLat : MathUtils.lerp(this.minLat, this.maxLat, 0.5),
                left ? this.minLon : MathUtils.lerp(this.minLon, this.maxLon, 0.5)
            ),
            GeoCoordinates.fromRadians(
                bottom ? MathUtils.lerp(this.minLat, this.maxLat, 0.5) : this.maxLat,
                left ? MathUtils.lerp(this.minLon, this.maxLon, 0.5) : this.maxLon
            )
        );

        this.clearSplitOperations();
        this.addSplitOperation(getUvSplitOperation("x"), !left);
        this.addSplitOperation(getUvSplitOperation("y"), !bottom);

        const sourceMesh = quantizedTerrainMesh.makeQuantizeMesh();

        let botResult: ClippedData | undefined, skirtResult: ClippedData | undefined;
        const capGroup = sourceMesh.geometry.groups[0];
        const capResult = this.getClippedData(sourceMesh, capGroup) as ClippedData;
        this.adjustVertices(capResult, sourceMesh.position, 0);

        let minHeight = Infinity;
        let maxHeight = -Infinity;
        const capPosition = capResult.attributes.position;
        for (let i = 0, l = capPosition.length / 3; i < l; i++) {
            const point = _vec.fromArray(capPosition, i * 3).add(sourceMesh.position);
            const geo = ellipsoid.unprojectPoint(point);
            const altitude = MathUtils.clamp(geo.altitude, -10000, 9000);

            minHeight = Math.min(minHeight, altitude);
            maxHeight = Math.max(maxHeight, altitude);
        }

        if (solid) {
            botResult = {
                index: capResult.index.slice().reverse(),
                attributes: {}
            };

            for (const key in capResult.attributes) {
                botResult.attributes[key] = capResult.attributes[key]?.slice();
            }

            const normal = botResult.attributes.normal;
            if (normal) {
                for (let i = 0; i < normal.length; i += 3) {
                    normal[i + 0]! *= -1;
                    normal[i + 1]! *= -1;
                    normal[i + 2]! *= -1;
                }
            }

            this.adjustVertices(botResult, sourceMesh.position, -skirtLength);
        }

        if (skirtLength > 0) {
            skirtResult = {
                index: [],
                attributes: {
                    position: [],
                    normal: [],
                    uv: []
                }
            };

            // push data onto the
            let nextIndex = 0;
            const vertToNewIndexMap: Record<string, number> = {};
            const pushVertex = (pos: Vector3, uv: Vector2, norm: Vector3) => {
                const hash = hashVertex(pos.x, pos.y, pos.z, norm.x, norm.y, norm.z, uv.x, uv.y);
                if (!(hash in vertToNewIndexMap)) {
                    vertToNewIndexMap[hash] = nextIndex;
                    nextIndex++;

                    skirtResult!.attributes.position.push(pos.x, pos.y, pos.z);
                    skirtResult!.attributes.normal.push(norm.x, norm.y, norm.z);
                    skirtResult!.attributes.uv.push(uv.x, uv.y);
                }

                skirtResult!.index.push(vertToNewIndexMap[hash]);
            };

            // TODO: this seems to have some problematic cases at the root tiles near the poles
            const capIndex = capResult.index;
            const capUv = capResult.attributes.uv;
            const capPosition = capResult.attributes.position;
            const capNormal = capResult.attributes.normal;
            const capTriangles = capResult.index.length / 3;

            for (let i = 0; i < capTriangles; i++) {
                const triOffset = 3 * i;
                for (let e = 0; e < 3; e++) {
                    const ne = (e + 1) % 3;
                    const i0 = capIndex[triOffset + e];
                    const i1 = capIndex[triOffset + ne];

                    _uv0.fromArray(capUv, i0 * 2);
                    _uv1.fromArray(capUv, i1 * 2);

                    // 精确化UV值，保证精度稳定
                    // 处理_uv0
                    if (Math.abs(_uv0.x - 0) < 0.0001) {
                        _uv0.x = 0;
                    } else if (Math.abs(_uv0.x - 0.5) < 0.0001) {
                        _uv0.x = 0.5;
                    } else if (Math.abs(_uv0.x - 1.0) < 0.0001) {
                        _uv0.x = 1.0;
                    }

                    if (Math.abs(_uv0.y - 0) < 0.0001) {
                        _uv0.y = 0;
                    } else if (Math.abs(_uv0.y - 0.5) < 0.0001) {
                        _uv0.y = 0.5;
                    } else if (Math.abs(_uv0.y - 1.0) < 0.0001) {
                        _uv0.y = 1.0;
                    }

                    // 处理_uv1
                    if (Math.abs(_uv1.x - 0) < 0.0001) {
                        _uv1.x = 0;
                    } else if (Math.abs(_uv1.x - 0.5) < 0.0001) {
                        _uv1.x = 0.5;
                    } else if (Math.abs(_uv1.x - 1.0) < 0.0001) {
                        _uv1.x = 1.0;
                    }

                    if (Math.abs(_uv1.y - 0) < 0.0001) {
                        _uv1.y = 0;
                    } else if (Math.abs(_uv1.y - 0.5) < 0.0001) {
                        _uv1.y = 0.5;
                    } else if (Math.abs(_uv1.y - 1.0) < 0.0001) {
                        _uv1.y = 1.0;
                    }

                    // find the vertices that lie on the edge
                    if (
                        (Math.abs(_uv0.x - _uv1.x) < 0.0001 &&
                            (_uv0.x === 0 ||
                                Math.abs(_uv0.x - 0.5) < 0.0001 ||
                                Math.abs(_uv0.x - 1.0) < 0.0001)) ||
                        (Math.abs(_uv0.y - _uv1.y) < 0.0001 &&
                            (_uv0.y === 0 ||
                                Math.abs(_uv0.y - 0.5) < 0.0001 ||
                                Math.abs(_uv0.y - 1.0) < 0.0001))
                    ) {
                        _pos0.fromArray(capPosition, i0 * 3);
                        _pos1.fromArray(capPosition, i1 * 3);

                        const u0 = _pos0;
                        const u1 = _pos1;

                        const b0 = _pos2.copy(_pos0);
                        const b1 = _pos3.copy(_pos1);

                        _temp.copy(b0).add(sourceMesh.position);
                        ellipsoid.surfaceNormal(_temp, _temp);
                        b0.addScaledVector(_temp, -skirtLength);

                        _temp.copy(b1).add(sourceMesh.position);
                        ellipsoid.surfaceNormal(_temp, _temp);
                        b1.addScaledVector(_temp, -skirtLength);

                        if (smoothSkirtNormals && capNormal) {
                            _temp.fromArray(capNormal, i0 * 3);
                            _temp2.fromArray(capNormal, i1 * 3);
                        } else {
                            _temp.subVectors(u0, u1);
                            _temp2.subVectors(u0, b0).cross(_temp).normalize();
                            _temp.copy(_temp2);
                        }

                        pushVertex(u1, _uv1, _temp2);
                        pushVertex(u0, _uv0, _temp);
                        pushVertex(b0, _uv0, _temp);

                        pushVertex(u1, _uv1, _temp2);
                        pushVertex(b0, _uv0, _temp);
                        pushVertex(b1, _uv1, _temp2);
                    }
                }
            }
        }

        const capLength = capResult.index.length;
        const result: ClippedData = capResult;
        if (botResult) {
            const { index, attributes } = botResult;
            const offset = result.attributes.position.length / 3;
            for (let i = 0, l = index.length; i < l; i++) {
                result.index.push(index[i] + offset);
            }

            for (const key in capResult.attributes) {
                result.attributes[key]?.push(...attributes[key]!);
            }
        }

        if (skirtResult) {
            const { index, attributes } = skirtResult;
            const offset = result.attributes.position.length / 3;
            for (let i = 0, l = index.length; i < l; i++) {
                result.index.push(index[i] + offset);
            }

            for (const key in capResult.attributes) {
                result.attributes[key]?.push(...attributes[key]!);
            }
        }

        // offset the uvs
        const xUvOffset = left ? 0 : -0.5;
        const yUvOffset = bottom ? 0 : -0.5;
        const uv = result.attributes.uv;
        for (let i = 0, l = uv.length; i < l; i += 2) {
            uv[i] = (uv[i] + xUvOffset) * 2.0;
            uv[i + 1] = (uv[i + 1] + yUvOffset) * 2.0;
        }

        const position = result.attributes.position;
        const webMercatorY = new BufferAttribute(new Float32Array(position.length / 3), 1);
        const altitudes = new BufferAttribute(new Float32Array(position.length / 3), 1);
        const convertWebMercatorY =
            clipBox &&
            new ConvertWebMercatorY(
                clipBox.southWest.latitudeInRadians,
                clipBox.northEast.latitudeInRadians
            );

        for (let i = 0, l = position.length / 3; i < l; i++) {
            const point = _vec.fromArray(position, i * 3).add(sourceMesh.position);

            const geo = ellipsoid.unprojectPoint(point);

            altitudes.array[i] = MathUtils.clamp(geo.altitude, -10000, 9000);

            if (this.isWebMercator) {
                webMercatorY.array[i] = 1 - convertWebMercatorY.convert(geo.latitudeInRadians);
            } else {
                webMercatorY.array[i] = uv[i * 2 + 1];
            }
        }

        // construct the result
        const resultMesh = this.constructMesh(result.attributes, result.index, sourceMesh);
        resultMesh.geometry.setAttribute("webMercatorY", webMercatorY);
        resultMesh.geometry.setAttribute("altitude", altitudes);

        resultMesh.userData.minHeight = minHeight;
        resultMesh.userData.maxHeight = maxHeight;

        let materialIndex = 0;
        let start = 0;
        resultMesh.geometry.addGroup(start, capLength, materialIndex);
        start += capLength;
        materialIndex++;

        if (botResult) {
            resultMesh.geometry.addGroup(start, botResult.index.length, materialIndex);
            start += botResult.index.length;
            materialIndex++;
        }

        if (skirtResult) {
            resultMesh.geometry.addGroup(start, skirtResult.index.length, materialIndex);
            start += skirtResult.index.length;
            materialIndex++;
        }

        resultMesh.userData.geoBox = clipBox.toArray();
        return new QuantizedTerrainMesh(resultMesh,quantizedTerrainMesh.geometryProjection);
    }

    private adjustVertices(info: ClippedData, position: Vector3, offset: number): void {
        const { ellipsoid, minLat, maxLat, minLon, maxLon } = this;
        const { attributes, vertexIsClipped } = info;
        const posArr = attributes.position;
        const uvArr = attributes.uv;

        const vertexCount = posArr.length / 3;
        for (let i = 0; i < vertexCount; i++) {
            const uv = _uv0.fromArray(uvArr, i * 2);
            if (vertexIsClipped && vertexIsClipped[i]) {
                if (Math.abs(uv.x - 0.5) < 1e-10) {
                    uv.x = 0.5;
                }

                if (Math.abs(uv.y - 0.5) < 1e-10) {
                    uv.y = 0.5;
                }

                _uv0.toArray(uvArr, i * 2);
            }

            const lat = MathUtils.lerp(minLat, maxLat, uv.y);
            const lon = MathUtils.lerp(minLon, maxLon, uv.x);
            const point = _vec.fromArray(posArr, i * 3).add(position);

            const geo = ellipsoid.unprojectPoint(point);
            ellipsoid.projectPoint(
                GeoCoordinates.fromRadians(lat, lon, geo.altitude + offset),
                point
            );

            point.sub(position);
            point.toArray(posArr, i * 3);
        }
    }
}

function getUvSplitOperation(axis: "x" | "y") {
    return (
        geometry: BufferGeometry,
        i0: number,
        i1: number,
        i2: number,
        barycoord: Vector3
    ): number => {
        const uv = geometry.attributes.uv as BufferAttribute;
        _uv0.fromBufferAttribute(uv, i0);
        _uv1.fromBufferAttribute(uv, i1);
        _uv2.fromBufferAttribute(uv, i2);
        const offset = 1e-6;
        return (
            _uv0[axis] * barycoord.x +
            _uv1[axis] * barycoord.y +
            _uv2[axis] * barycoord.z -
            (0.5 - offset)
        );
    };
}
