import { allPolygons, Polygon } from "@flywave/flywave-geometry";
import { fromVectors } from "@flywave/flywave-geoutils";
import * as THREE from "three";

import { BspObject } from "./BspObject";

export type FaceType = number;

export const FaceTypes = {
    TopFace: 1 << 0,
    BaseFace: 1 << 1,
    SideFace: 1 << 2,
    BoundaryFace: 1 << 3,
    GroundFace: 1 << 4,
    BedrockFace: 1 << 5,
    CutFace: 1 << 6,
    BoundarySideFace: (1 << 2) | (1 << 3),
    TopGroundFace: (1 << 0) | (1 << 4),
    BaseBedrockFace: (1 << 5) | (1 << 1)
} as const;

export class StratumVoxel extends BspObject {
    private readonly _id: string;
    private readonly _index: number;
    private _bbox?: THREE.Box3;
    private _geometry?: THREE.BufferGeometry;
    private _material?: THREE.Material;
    private _neighbors: [
        StratumVoxel | undefined,
        StratumVoxel | undefined,
        StratumVoxel | undefined
    ];

    constructor(
        id: string,
        index: number,
        bbox?: THREE.Box3,
        geometry?: THREE.BufferGeometry,
        material?: THREE.Material
    ) {
        super();
        this._id = id;
        this._index = index;
        this._geometry = geometry;
        this._material = material;
        this._bbox = bbox;
        this._bsp = this.buildBsp();
        this._neighbors = [undefined, undefined, undefined];
    }

    get id() {
        return this._id;
    }

    get index() {
        return this._index;
    }

    get material(): THREE.Material {
        return this._material!;
    }

    get geometry(): THREE.BufferGeometry {
        return this._geometry!;
    }

    get bbox(): THREE.Box3 {
        return this._bbox!;
    }

    get neighbors() {
        return this._neighbors;
    }

    dispose() {
        this._geometry?.dispose();
        this._material?.dispose();
        this._geometry = undefined;
        this._material = undefined;
        this._bsp = undefined;
        this._bbox = undefined;
    }

    get volume(): number {
        const polygons = this.getPolygons();
        let signedVolume = 0;

        for (const poly of polygons) {
            const [v0, v1, v2] = poly.vectors;
            const v0Vec = new THREE.Vector3(v0.x, v0.y, v0.z);
            const v1Vec = new THREE.Vector3(v1.x, v1.y, v1.z);
            const v2Vec = new THREE.Vector3(v2.x, v2.y, v2.z);

            const crossProduct = new THREE.Vector3().crossVectors(v1Vec, v2Vec);
            signedVolume += v0Vec.dot(crossProduct);
        }

        return Math.abs(signedVolume) / 6;
    }

    linkNeighbors(allVoxels: StratumVoxel[], neighbors: [number, number, number]) {
        this._neighbors = neighbors.map(idx => (idx !== -1 ? allVoxels[idx] : undefined)) as [
            StratumVoxel | undefined,
            StratumVoxel | undefined,
            StratumVoxel | undefined
        ];
    }

    protected polygonsToGeometry(polygons: readonly Polygon[]): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        const positions: number[] = [];
        const facetypes: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        // 计算面法线
        const computeFaceNormal = (poly: Polygon) => {
            const v0 = poly.vectors[0];
            const v1 = poly.vectors[1];
            const v2 = poly.vectors[2];
            const a = new THREE.Vector3().subVectors(v1, v0);
            const b = new THREE.Vector3().subVectors(v2, v0);
            const normal = new THREE.Vector3().crossVectors(a, b).normalize();
            return normal;
        };

        polygons.forEach((poly: any) => {
            const baseIndex = positions.length / 3;
            const faceNormal = computeFaceNormal(poly);
            const faceType = poly.faceType || FaceTypes.SideFace;

            // 添加顶点数据
            for (let i = 0; i < poly.vectors.length; i++) {
                const vec = poly.vectors[i];
                positions.push(vec.x, vec.y, vec.z);

                // 添加法线（平坦着色）
                normals.push(faceNormal.x, faceNormal.y, faceNormal.z);

                // 添加面类型
                facetypes.push(faceType);

                // 添加UV坐标（如果存在）
                if (poly.uvs && poly.uvs[i]) {
                    uvs.push(poly.uvs[i].u, poly.uvs[i].v);
                } else {
                    uvs.push(0, 0); // 默认UV
                }
            }

            // 生成三角形索引（三角扇）
            for (let i = 1; i < poly.vectors.length - 1; i++) {
                indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
            }
        });

        // 设置几何体属性
        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(new Float32Array(positions), 3)
        );

        if (facetypes.length > 0) {
            geometry.setAttribute(
                "facetypes",
                new THREE.BufferAttribute(new Uint32Array(facetypes), 1)
            );
        }

        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));

        geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));

        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        return geometry;
    }

    getTopTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.TopFace);
    }

    getBaseTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.BaseFace);
    }

    getTrianglesByFaceType(faceType: FaceType): Float32Array {
        if (!this._geometry) {
            return new Float32Array(0);
        }

        const positionAttr = this._geometry.getAttribute("position");
        const indexAttr = this._geometry.getIndex();
        // @ts-ignore - custom attribute
        const faceTypesAttr = this._geometry.getAttribute("facetypes");

        if (!positionAttr || !indexAttr || !faceTypesAttr) {
            return new Float32Array(0);
        }

        const positions = positionAttr.array;
        const indices = indexAttr.array;
        const faceTypesArray = faceTypesAttr.array;
        const result: number[] = [];

        for (let i = 0; i < indices.length; i += 3) {
            const faceTypeIndex = Math.floor(i / 3);
            if (faceTypesArray[faceTypeIndex] & faceType) {
                const i0 = indices[i] * 3;
                const i1 = indices[i + 1] * 3;
                const i2 = indices[i + 2] * 3;

                result.push(
                    positions[i0],
                    positions[i0 + 1],
                    positions[i0 + 2],
                    positions[i1],
                    positions[i1 + 1],
                    positions[i1 + 2],
                    positions[i2],
                    positions[i2 + 1],
                    positions[i2 + 2]
                );
            }
        }

        return new Float32Array(result);
    }

    protected buildPolygons(): Polygon[] {
        if (!this._geometry) {
            return [];
        }

        const polygons: Polygon[] = [];
        const positionAttr = this._geometry.getAttribute("position");
        const indexAttr = this._geometry.getIndex();
        const uvAttr = this._geometry.getAttribute("uv");
        // @ts-ignore - custom attribute
        const faceTypesAttr = this._geometry.getAttribute("facetypes");

        if (!positionAttr || !indexAttr) {
            return [];
        }

        const positions = positionAttr.array;
        const indices = indexAttr.array;
        const uvs = uvAttr ? uvAttr.array : null;
        const faceTypes = faceTypesAttr ? faceTypesAttr.array : null;

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];

            const vectors = [
                new THREE.Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]),
                new THREE.Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]),
                new THREE.Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2])
            ];

            const uvData = uvs
                ? [
                      { u: uvs[i0 * 2], v: uvs[i0 * 2 + 1] },
                      { u: uvs[i1 * 2], v: uvs[i1 * 2 + 1] },
                      { u: uvs[i2 * 2], v: uvs[i2 * 2 + 1] }
                  ]
                : null;

            const faceType = faceTypes ? faceTypes[Math.floor(i / 3)] : FaceTypes.SideFace;

            const plane = fromVectors(vectors);
            const poly = {
                vectors,
                plane,
                faceType,
                uvs: uvData
            } as Polygon & { faceType: number; uvs?: Array<{ u: number; v: number }> };

            polygons.push(poly);
        }

        return polygons;
    }

    getPolygons(): readonly Polygon[] {
        if (!this._bsp) {
            return [];
        }
        return allPolygons(this._bsp);
    }

    getBoundingBox(): THREE.Box3 {
        if (this._bbox) {
            return this._bbox;
        }

        if (!this._geometry) {
            return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
        }

        const positionAttr = this._geometry.getAttribute("position");
        if (!positionAttr) {
            return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
        }

        const positions = positionAttr.array;
        const box = new THREE.Box3();

        for (let i = 0; i < positions.length; i += 3) {
            box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
        }

        this._bbox = box;
        return box;
    }
}
