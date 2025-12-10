/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type Projection,
    ConvertWebMercatorY,
    GeoCoordinates
} from "@flywave/flywave-geoutils";
import {
    BufferAttribute,
    BufferGeometry,
    DataTexture,
    LinearFilter,
    LinearMipMapLinearFilter,
    MathUtils,
    Mesh,
    MeshStandardMaterial,
    RGFormat,
    Triangle,
    UnsignedByteType,
    Vector3
} from "three";

import {
    type SerializedGroundModificationPolygon,
    GroundModificationPolygon
} from "../../ground-modification-manager";
import { type QuantizedMeshData, QuantizedMeshLoaderBase } from "./QuantizedMeshLoaderBase";
import { QuantizedTerrainMesh } from "./QuantizedTerrainMesh";

const _norm = new Vector3();
const _tri = new Triangle();
const _uvh = new Vector3();
const _pos = new Vector3();

interface EdgeStrip {
    uv: number[];
    positions: number[];
    indices: number[];
    normals: number[] | null;
}

interface WaterMaskExtension {
    extensionId: number;
    mask: Uint8Array;
    size: number;
}

interface MetadataJson {
    geometricerror?: number;
    available?: Array<{
        startX: number;
        startY: number;
        endX: number;
        endY: number;
    }>;
    [key: string]: unknown;
}

export interface MetadataExtension {
    extensionId: number;
    json: MetadataJson;
}

interface OctVertexNormalsExtension {
    extensionId: number;
    normals: Float32Array;
}

export interface QuantizedMeshLoaderOptions {
    skirtLength?: number;
    smoothSkirtNormals?: boolean;
    isWebMercator?: boolean;
    solid?: boolean;
    geoBox: GeoBox;
    elevationMapEnabled: boolean;
    elevationMapFlipY: boolean;
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
}

export class QuantizedMeshLoader extends QuantizedMeshLoaderBase {
    skirtLength: number;
    smoothSkirtNormals: boolean;
    solid: boolean;

    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;

    constructor(
        private readonly ellipsoid: Projection,
        private readonly options: QuantizedMeshLoaderOptions
    ) {
        super();
        this.skirtLength = options.skirtLength || 1000;
        this.smoothSkirtNormals =
            options.smoothSkirtNormals === undefined ? true : options.smoothSkirtNormals;
        this.solid = options.solid || false;

        const { south, west, north, east } = options.geoBox;

        // set the range of the tile
        this.minLat = MathUtils.degToRad(south);
        this.maxLat = MathUtils.degToRad(north);
        this.minLon = MathUtils.degToRad(west);
        this.maxLon = MathUtils.degToRad(east);
    }

    parse(buffer: ArrayBuffer): QuantizedTerrainMesh {
        const {
            ellipsoid,
            solid,
            skirtLength,
            smoothSkirtNormals,

            minLat,
            maxLat,
            minLon,
            maxLon
        } = this;

        const { header, indices, vertexData, edgeIndices, extensions } = this.decode(
            buffer
        ) as QuantizedMeshData & {
            extensions: {
                octvertexnormals?: OctVertexNormalsExtension;
                watermask?: WaterMaskExtension;
                metadata?: MetadataExtension;
            };
        };

        const geometry = new BufferGeometry();
        const material = new MeshStandardMaterial();
        const mesh = new Mesh(geometry, material);

        let tileCenter = this.ellipsoid.projectPoint(this.options.geoBox.center);

        mesh.position.copy(tileCenter);

        const includeNormals = "octvertexnormals" in extensions;
        const vertexCount = vertexData.u.length;
        const positions: number[] = [];
        const uvs: number[] = [];
        const webMercatorY: number[] = [];
        const indexArr: number[] = [];
        const normals: number[] = [];
        let groupOffset = 0;
        let materialIndex = 0;


        // construct terrain
        for (let i = 0; i < vertexCount; i++) {
            readUVHeight(i, _uvh);
            readPosition(_uvh.x, _uvh.y, _uvh.z, _pos);

            uvs.push(_uvh.x, _uvh.y);
            positions.push(..._pos.toArray());
        }

        for (let i = 0, l = indices.length; i < l; i++) {
            indexArr.push(indices[i]);
        }

        if (includeNormals && extensions.octvertexnormals) {
            const extNormals = extensions.octvertexnormals.normals;
            for (let i = 0, l = extNormals.length; i < l; i++) {
                normals.push(extNormals[i]);
            }
        }

        // add material group
        geometry.addGroup(groupOffset, indices.length, materialIndex);
        groupOffset += indices.length;
        materialIndex++;

        // create a lower cap
        if (solid) {
            const indexOffset = positions.length / 3;
            for (let i = 0; i < vertexCount; i++) {
                readUVHeight(i, _uvh);
                readPosition(_uvh.x, _uvh.y, _uvh.z, _pos, -skirtLength);

                uvs.push(_uvh.x, _uvh.y);
                positions.push(..._pos.toArray());
            }

            for (let i = indices.length - 1; i >= 0; i--) {
                indexArr.push(indices[i] + indexOffset);
            }

            if (includeNormals && extensions.octvertexnormals) {
                const extNormals = extensions.octvertexnormals.normals;
                for (let i = 0, l = extNormals.length; i < l; i++) {
                    normals.push(-extNormals[i]);
                }
            }

            // add material group
            geometry.addGroup(groupOffset, indices.length, materialIndex);
            groupOffset += indices.length;
            materialIndex++;
        }

        // construct skirts
        if (skirtLength > 0) {
            const { westIndices, eastIndices, southIndices, northIndices } = edgeIndices;

            // construct the indices
            let offset: number;

            // west
            const westStrip = constructEdgeStrip(westIndices);
            offset = positions.length / 3;
            uvs.push(...westStrip.uv);
            positions.push(...westStrip.positions);
            for (let i = 0, l = westStrip.indices.length; i < l; i++) {
                indexArr.push(westStrip.indices[i] + offset);
            }

            // east
            const eastStrip = constructEdgeStrip(eastIndices);
            offset = positions.length / 3;
            uvs.push(...eastStrip.uv);
            positions.push(...eastStrip.positions);
            for (let i = 0, l = eastStrip.indices.length; i < l; i++) {
                indexArr.push(eastStrip.indices[i] + offset);
            }

            // south
            const southStrip = constructEdgeStrip(southIndices);
            offset = positions.length / 3;
            uvs.push(...southStrip.uv);
            positions.push(...southStrip.positions);
            for (let i = 0, l = southStrip.indices.length; i < l; i++) {
                indexArr.push(southStrip.indices[i] + offset);
            }

            // north
            const northStrip = constructEdgeStrip(northIndices);
            offset = positions.length / 3;
            uvs.push(...northStrip.uv);
            positions.push(...northStrip.positions);
            for (let i = 0, l = northStrip.indices.length; i < l; i++) {
                indexArr.push(northStrip.indices[i] + offset);
            }

            // add the normals
            if (includeNormals) {
                if (westStrip.normals) normals.push(...westStrip.normals);
                if (eastStrip.normals) normals.push(...eastStrip.normals);
                if (southStrip.normals) normals.push(...southStrip.normals);
                if (northStrip.normals) normals.push(...northStrip.normals);
            }

            // add material group
            geometry.addGroup(groupOffset, indices.length, materialIndex);
            groupOffset += indices.length;
            materialIndex++;
        }

        const altitudes: number[] = [];
        {
            // shift the positions by the center of the tile
            let uvIndex = 0;

            const convertWebMercatorY = new ConvertWebMercatorY(minLat, maxLat);

            for (let i = 0, l = positions.length; i < l; i += 3) {
                const geo = this.ellipsoid.unprojectPoint(new Vector3().fromArray(positions, i));
                altitudes.push(geo.altitude);

                positions[i + 0] -= mesh.position.x;
                positions[i + 1] -= mesh.position.y;
                positions[i + 2] -= mesh.position.z;

                if (this.options.isWebMercator) {
                    webMercatorY.push(1.0 - convertWebMercatorY.convert(geo.latitudeInRadians));
                } else {
                    webMercatorY.push(uvs[uvIndex + 1]);
                }

                uvIndex += 2;
            }
        }

        // generate geometry and mesh
        const indexBuffer =
            positions.length / 3 > 65535 ? new Uint32Array(indexArr) : new Uint16Array(indexArr);
        geometry.setIndex(new BufferAttribute(indexBuffer, 1, false));
        geometry.setAttribute(
            "position",
            new BufferAttribute(new Float32Array(positions), 3, false)
        );
        geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2, false));
        geometry.setAttribute(
            "webMercatorY",
            new BufferAttribute(new Float32Array(webMercatorY), 1, false)
        );
        geometry.setAttribute(
            "altitude",
            new BufferAttribute(new Float32Array(altitudes), 1, false)
        );
        if (includeNormals) {
            geometry.setAttribute(
                "normal",
                new BufferAttribute(new Float32Array(normals), 3, false)
            );
        }

        // generate the water texture
        if ("watermask" in extensions && extensions.watermask) {
            // invert the mask data
            // TODO: this inversion step can be a bit slow
            const { mask, size } = extensions.watermask;
            const maskBuffer = new Uint8Array(2 * size * size);
            for (let i = 0, l = mask.length; i < l; i++) {
                const v = mask[i] === 255 ? 0 : 255;
                maskBuffer[2 * i + 0] = v;
                maskBuffer[2 * i + 1] = v;
            }

            // TODO: Luminance format is not supported - eventually node materials will
            // make it possible to map the texture to the appropriate buffer input.
            const map = new DataTexture(maskBuffer, size, size, RGFormat, UnsignedByteType);
            map.flipY = true;
            map.minFilter = LinearMipMapLinearFilter;
            map.magFilter = LinearFilter;
            map.needsUpdate = true;

            material.roughnessMap = map;
        }

        // set metadata
        mesh.userData.minHeight = header.minHeight;
        mesh.userData.maxHeight = header.maxHeight;

        if ("metadata" in extensions && extensions.metadata) {
            mesh.userData.metadata = extensions.metadata.json;
        }

        mesh.userData.geoBox = [
            (this.minLat * 180) / Math.PI,
            (this.minLon * 180) / Math.PI,
            (this.maxLat * 180) / Math.PI,
            (this.maxLon * 180) / Math.PI,
            header.minHeight,
            header.maxHeight
        ];

        return new QuantizedTerrainMesh(
            mesh,
            this.ellipsoid,
            material.roughnessMap
                ? {
                      ...material.roughnessMap.image,
                      geoBox: [
                          this.minLat,
                          this.minLon,
                          this.maxLat,
                          this.maxLon,
                          header.minHeight,
                          header.maxHeight
                      ]
                  }
                : undefined
        );

        function readUVHeight(index: number, target: Vector3): Vector3 {
            target.x = vertexData.u[index];
            target.y = vertexData.v[index];
            target.z = vertexData.height[index];
            return target;
        }

        function readPosition(
            u: number,
            v: number,
            h: number,
            target: Vector3,
            heightOffset: number = 0
        ): Vector3 {
            const height = MathUtils.lerp(header.minHeight, header.maxHeight, h);
            const lon = MathUtils.lerp(minLon, maxLon, u);
            const lat = MathUtils.lerp(minLat, maxLat, v);

            ellipsoid.projectPoint(
                GeoCoordinates.fromRadians(lat, lon, height + heightOffset),
                target
            );

            return target;
        }

        function constructEdgeStrip(indices: Uint16Array | Uint32Array): EdgeStrip {
            const topUvs: number[] = [];
            const topPos: number[] = [];
            const botUvs: number[] = [];
            const botPos: number[] = [];
            const sideIndices: number[] = [];

            for (let i = 0, l = indices.length; i < l; i++) {
                readUVHeight(indices[i], _uvh);
                topUvs.push(_uvh.x, _uvh.y);
                botUvs.push(_uvh.x, _uvh.y);

                readPosition(_uvh.x, _uvh.y, _uvh.z, _pos);
                topPos.push(..._pos.toArray());

                readPosition(_uvh.x, _uvh.y, _uvh.z, _pos, -skirtLength);
                botPos.push(..._pos.toArray());
            }

            const triCount = indices.length - 1;
            for (let i = 0; i < triCount; i++) {
                const t0 = i;
                const t1 = i + 1;
                const b0 = i + indices.length;
                const b1 = i + indices.length + 1;

                sideIndices.push(t0, b0, t1);
                sideIndices.push(t1, b0, b1);
            }

            let normals: number[] | null = null;
            if (includeNormals && extensions.octvertexnormals) {
                const total = (topPos.length + botPos.length) / 3;

                if (smoothSkirtNormals) {
                    normals = new Array(total * 3);

                    const extNormals = extensions.octvertexnormals.normals;
                    const botOffset = normals.length / 2;
                    for (let i = 0, l = total / 2; i < l; i++) {
                        const index = indices[i];
                        const i3 = 3 * i;
                        const nx = extNormals[3 * index + 0];
                        const ny = extNormals[3 * index + 1];
                        const nz = extNormals[3 * index + 2];

                        normals[i3 + 0] = nx;
                        normals[i3 + 1] = ny;
                        normals[i3 + 2] = nz;

                        normals[botOffset + i3 + 0] = nx;
                        normals[botOffset + i3 + 1] = ny;
                        normals[botOffset + i3 + 2] = nz;
                    }
                } else {
                    normals = [];
                    _tri.a.fromArray(topPos, 0);
                    _tri.b.fromArray(botPos, 0);
                    _tri.c.fromArray(topPos, 3);
                    _tri.getNormal(_norm);

                    for (let i = 0; i < total; i++) {
                        normals.push(..._norm.toArray());
                    }
                }
            }

            return {
                uv: [...topUvs, ...botUvs],
                positions: [...topPos, ...botPos],
                indices: sideIndices,
                normals
            };
        }
    }
}
