import { Polygon } from "../csg/Polygon";
import { BSPNode, fromPolygons } from "../csg/Bsp";
import { fromVectors } from "../utils/plane";
import { cross, dot, lengthV, minus, normalize, Vector } from "../utils/vector";
import { triangulate } from "../triangulate";
import * as THREE from "three";

// 陷落柱剖面结构
export interface CollapseProfile {
    collapseID: string;        // 陷落柱唯一标识
    crossSections: THREE.BufferGeometry[];  // MeshGeometry -> THREE.BufferGeometry
    polys: Vector[][];       // 陷落柱边界多边形集合
}

export class CollapsePillar {
    private _id: string;
    private _name: string;
    private _lithology: string;
    private _topCenter: [number, number, number];
    private _baseCenter: [number, number, number];
    private _topRadius: number;
    private _baseRadius: number;
    private _height: number;
    private _stratumId: string;
    private _bbox?: THREE.Box3;
    private _bsp?: BSPNode;
    private _geometry?: THREE.BufferGeometry;  // 修改类型
    private _material?: THREE.Material;       // 修改类型

    constructor(collapse: {
        id: string;
        name: string;
        topCenter: [number, number, number];
        baseCenter: [number, number, number];
        topRadius: number;
        baseRadius: number;
        height: number;
        stratumId: string;
        lithology: string;
    }, bbox?: THREE.Box3, geometry?: THREE.BufferGeometry, material?: THREE.Material) {
        this._id = collapse.id;
        this._name = collapse.name;
        this._lithology = collapse.lithology;
        this._topCenter = collapse.topCenter;
        this._baseCenter = collapse.baseCenter;
        this._topRadius = collapse.topRadius;
        this._baseRadius = collapse.baseRadius;
        this._height = collapse.height;
        this._stratumId = collapse.stratumId;
        this._bbox = bbox;
        this._geometry = geometry;
        this._material = material;
        this._bsp = this.buildBsp()
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    get lithology() {
        return this._lithology;
    }

    get topCenter() {
        return this._topCenter;
    }

    get baseCenter() {
        return this._baseCenter;
    }

    get topRadius() {
        return this._topRadius;
    }

    get baseRadius() {
        return this._baseRadius;
    }

    get height() {
        return this._height;
    }

    get stratumId() {
        return this._stratumId;
    }

    get geometry(): THREE.BufferGeometry {  
        return this._geometry!;
    }

    get material(): THREE.Material {      
        return this._material!;
    }

    get bbox() {
        return this._bbox;
    }

    get bsp() {
        return this._bsp;
    }

    dispose() {
        if (this._geometry) {
            this._geometry.dispose();
        }
        if (this._material) {
            this._material.dispose();
        }
        // 释放几何数据
        this._geometry = undefined;
        // 释放材质数据
        this._material = undefined;
        // 释放BSP树
        this._bsp = undefined;
        // 清空包围盒引用
        this._bbox = undefined;
    }

    generateCrossSections(line: [Vector, Vector]): { positions: Vector[], indices: number[][] } | undefined {
        // 1. 计算切割平面与几何体的交点
        const intersectionPoints = this.calculateIntersection(line);

        if (intersectionPoints.length < 3) return;

        // 2. 对交点进行排序（凸多边形简单排序）
        const sortedPoints = this.sortConvexPoints(intersectionPoints);

        // 3. 生成三角剖分
        return triangulate(sortedPoints);
    }

    // 计算切割平面与凸几何体的交点
    private calculateIntersection(line: [Vector, Vector]): Vector[] {
        if (!this._geometry) {
            return [];
        }
        const { attributes, indices, facetypes } = this._geometry;
        const positions = attributes.POSITION?.value;
        const indicesArray = indices?.value;
        const intersections: Vector[] = [];

        if (!positions || !indicesArray) {
            return [];
        }

        // 遍历所有三角形边
        for (let i = 0; i < indicesArray.length; i += 3) {
            const i1 = indicesArray[i] * 3;
            const i2 = indicesArray[i + 1] * 3;
            const i3 = indicesArray[i + 2] * 3;

            const triangle = [
                { x: positions[i1], y: positions[i1 + 1], z: positions[i1 + 2] },
                { x: positions[i2], y: positions[i2 + 1], z: positions[i2 + 2] },
                { x: positions[i3], y: positions[i3 + 1], z: positions[i3 + 2] }
            ];

            // 计算边与切割平面的交点
            for (let j = 0; j < 3; j++) {
                const a = triangle[j];
                const b = triangle[(j + 1) % 3];
                const intersection = this.intersectEdgeWithPlane(a, b, line);
                if (intersection) {
                    intersections.push(intersection);
                }
            }
        }
        return this.removeDuplicates(intersections);
    }

    private intersectEdgeWithPlane(a: Vector, b: Vector, line: [Vector, Vector]): Vector | null {
        // 获取平面定义（使用切割线段和垂直方向）
        const planePoint = line[0];
        const lineDirection = minus(line[1], line[0]);

        // 计算平面法向量（垂直于切割线段和Y轴）
        let planeNormal = cross(lineDirection, { x: 0, y: 1, z: 0 });

        // 处理平行情况
        if (lengthV(planeNormal) < 1e-6) {
            planeNormal = cross(lineDirection, { x: 0, y: 0, z: 1 });
            if (lengthV(planeNormal) < 1e-6) return null;
        }
        planeNormal = normalize(planeNormal);

        // 线段参数方程：a + t*(b-a)
        const edgeVector = minus(b, a);
        const denominator = dot(edgeVector, planeNormal);

        // 处理平行情况
        if (Math.abs(denominator) < 1e-6) return null;

        // 计算交点参数t
        const t = dot(minus(planePoint, a), planeNormal) / denominator;

        // 检查是否在线段范围内
        if (t < 0 || t > 1) return null;

        // 计算交点坐标
        return {
            x: a.x + edgeVector.x * t,
            y: a.y + edgeVector.y * t,
            z: a.z + edgeVector.z * t,
            metadata: a.metadata
        };
    }

    // 凸多边形顶点排序（简单极角排序）
    private sortConvexPoints(points: Vector[]): Vector[] {
        if (points.length === 0) return [];

        // 找到质心
        const centroid = points.reduce((acc, cur) => ({ x: acc.x + cur.x, y: acc.y + cur.y, z: acc.z + cur.z }),
            { x: 0, y: 0, z: 0 } as Vector
        );

        normalize(centroid);

        // 极角排序
        return points.sort((a, b) => {
            const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
            const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
            return angleA - angleB;
        });
    }

    // 去除重复点
    private removeDuplicates(points: Vector[], epsilon = 1e-6): Vector[] {
        return points.filter((p, i) =>
            !points.slice(0, i).some(q =>
                Math.abs(p.x - q.x) < epsilon &&
                Math.abs(p.y - q.y) < epsilon &&
                Math.abs(p.z - q.z) < epsilon
            )
        );
    }

    /**
     * 从当前体素的多边形构建BSP树
     * @returns 构建好的BSP树节点
     */
    private buildBsp(): BSPNode {
        // 假设我们有一个方法获取体素的所有多边形
        const polygons = this.buildPolygons();
        return fromPolygons(polygons);
    }

    /**
     * 获取体素的所有多边形（需要根据实际数据结构实现）
     * @private
     */
    private buildPolygons(): Polygon[] {
        if (!this._geometry) {
            return [];
        }
        const polygons: Polygon[] = [];
        const { attributes, indices } = this._geometry;
        const positions = attributes.POSITION?.value;
        const indicesArray = indices?.value;

        if (!positions || !indicesArray) {
            return [];
        }

        if (positions && indices) {
            for (let i = 0; i < indicesArray.length; i += 3) {
                const i0 = indicesArray[i] * 3;
                const i1 = indicesArray[i + 1] * 3;
                const i2 = indicesArray[i + 2] * 3;

                const vectors: Vector[] = [
                    { x: positions[i0], y: positions[i0 + 1], z: positions[i0 + 2] },
                    { x: positions[i1], y: positions[i1 + 1], z: positions[i1 + 2] },
                    { x: positions[i2], y: positions[i2 + 1], z: positions[i2 + 2] }
                ];

                // 这里需要计算平面方程，可能需要添加planeFromPoints方法
                const plane = fromVectors(vectors);

                polygons.push({ vectors, plane });
            }
        }
        return polygons;
    }

}