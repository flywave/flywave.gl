import { BSPNode, allPolygons, build, clipTo, fromPolygons, invert } from "../csg/bsp";
import { Polygon } from "../csg/polygon";
import { fromVectors } from "../utils/plane";
import { cross, dot, lengthV, minus, Vector } from "../utils/vector";
import * as THREE from 'three';

export type FaceType = number;

export const FaceTypes = {
    TopFace: 1 << 0,          // 1 (0b0001)
    BaseFace: 1 << 1,        // 2 (0b0010)
    SideFace: 1 << 2,        // 4 (0b0100)
    BoundaryFace: 1 << 3,    // 8 (0b1000)
    GroundFace: 1 << 4,      // 16 (0b00010000) 地表
    BedrockFace: 1 << 5,     // 32 (0b00100000) 基岩
    CutFace: 1 << 6,         // 64 (0b10000000) 切割面
    BoundarySideFace: (1 << 2) | (1 << 3),  // 12 (0b1100)
    TopGroundFace: (1 << 0) | (1 << 4),    // 17 (0b00010001) 地表顶板
    BaseBedrockFace: (1 << 5) | (1 << 1)   // 34 (0b00100010) 基岩底板
} as const;

export class StratumVoxel {
    private _id: string;
    private _index: number;
    private _bsp?: BSPNode;
    private _bbox?: THREE.Box3;
    private _geometry?: THREE.BufferGeometry;  // 类型替换
    private _material?: THREE.Material;       // 类型替换
    private _neighbors: [StratumVoxel | undefined, StratumVoxel | undefined, StratumVoxel | undefined];

    constructor(id: string, index: number, bbox?: THREE.Box3, geometry?: THREE.BufferGeometry, material?: THREE.Material) {
        this._id = id;
        this._index = index;
        this._geometry = geometry;
        this._material = material;
        this._bbox = bbox;
        this._bsp = this.buildBsp();
        this._neighbors = [undefined, undefined, undefined]
    }

    get id() {
        return this._id;
    }

    get index() {
        return this._index;
    }

    get material(): THREE.Material {           // 返回类型修改
        return this._material!;
    }

    get geometry(): THREE.BufferGeometry {     // 返回类型修改
        return this._geometry!;
    }


    get bsp() {
        return this._bsp;
    }

    get bbox(): THREE.Box3 {
        return this._bbox!;
    }

    get neighbors(): [StratumVoxel | undefined, StratumVoxel | undefined, StratumVoxel | undefined] {
        return this._neighbors;
    }

    dispose() {
        this._geometry?.dispose();
        this._material?.dispose();
        // 释放几何数据引用
        this._geometry = undefined;
        // 释放材质引用
        this._material = undefined;
        // 销毁BSP树结构
        this._bsp = undefined;
        // 清空包围盒缓存
        this._bbox = undefined;
    }

    /**
     * 计算体素的精确体积（基于三角形面片）
     */
    get volume(): number {
        const polygons = this.getPolygons();
        let signedVolume = 0;

        for (const poly of polygons) {
            // 每个多边形都是三角形（来自buildPolygons实现）
            const [v0, v1, v2] = poly.vectors;

            // 计算四面体体积贡献公式：v0 · (v1 × v2)
            const crossProduct = cross(v1, v2);
            signedVolume += dot(v0, crossProduct);
        }

        // 取绝对值并除以6
        return Math.abs(signedVolume) / 6;
    }

    linkNeighbors(allVoxels: StratumVoxel[], neighbors: [number, number, number]) {
        this._neighbors = neighbors.map(idx =>
            idx !== -1 ? allVoxels[idx] : undefined
        ) as [StratumVoxel | undefined, StratumVoxel | undefined, StratumVoxel | undefined];
    }

    clipGeometry(node: BSPNode): THREE.BufferGeometry | undefined {
        const status = this.intersection(node);

        switch (status) {
            case 'inside':
                return undefined;
            case 'outside':
                return this._geometry;
            case 'intersect':
                if (!this._bsp) {
                    this._bsp = this.buildBsp();
                }
                if (!this._geometry) {
                    return undefined;
                }
                const clippedA = clipTo(invert(this._bsp), node);
                const clippedB = invert(clipTo(invert(clipTo(node, clippedA)), clippedA));
                const outs = allPolygons(invert(build(allPolygons(clippedB), clippedA)));
                return this.polygonsToGeometry(outs);
            default:
                return this._geometry;
        }
    }

    /**
     * 将多边形数组转换为网格几何体
     * @private
     */
    private polygonsToGeometry(polygons: readonly Polygon[]): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        // 实现多边形到网格几何体的转换逻辑
        // 这里需要根据实际需求实现
        const positions: number[] = [];
        const indices: number[] = [];

        polygons.forEach((poly, polyIndex) => {
            const baseIndex = positions.length / 3;
            poly.vectors.forEach(vec => {
                positions.push(vec.x, vec.y, vec.z);
            });
            // 简单三角剖分（假设多边形是凸的）
            for (let i = 1; i < poly.vectors.length - 1; i++) {
                indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
            }
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        return geometry;
    }

    /**
     * 获取顶部三角面片数据
     */
    getTopTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.TopFace);
    }

    /**
     * 获取底部三角面片数据
     */
    getBaseTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.BaseFace);
    }

    /**
     * 根据面类型获取符合条件的三角形数组
     * @param faceType 要筛选的面类型
     * @returns 返回符合条件的三维坐标数组，每组3个点构成一个三角形
     */
    getTrianglesByFaceType(faceType: FaceType): Float32Array {
        if (!this._geometry) {
            return new Float32Array(0);
        }
        const { attributes, indices, facetypes } = this._geometry;
        const positions = attributes.POSITION?.value;
        const indicesArray = indices?.value;
        const faceTypesArray = facetypes?.value;

        if (!positions || !indicesArray || !faceTypesArray) {
            return new Float32Array(0);
        }

        const result: number[] = [];

        // 遍历所有三角形
        for (let i = 0; i < indicesArray.length; i += 3) {
            const faceTypeIndex = Math.floor(i / 3);
            if (faceTypesArray[faceTypeIndex] & faceType) {
                // 获取三个顶点的索引
                const i0 = indicesArray[i] * 3;
                const i1 = indicesArray[i + 1] * 3;
                const i2 = indicesArray[i + 2] * 3;

                // 添加顶点坐标到结果
                result.push(
                    positions[i0], positions[i0 + 1], positions[i0 + 2],
                    positions[i1], positions[i1 + 1], positions[i1 + 2],
                    positions[i2], positions[i2 + 1], positions[i2 + 2]
                );
            }
        }

        return new Float32Array(result);
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

    /**
     * 获取体素的所有多边形（需要根据实际数据结构实现）
     * @returns 多边形数组
     */
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
            return [[0, 0, 0], [0, 0, 0]];
        }
        const { attributes } = this._geometry;
        const positions = attributes.POSITION?.value;
        if (!positions) {
            return [[0, 0, 0], [0, 0, 0]];
        }
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < positions.length; i += 3) {
            minX = Math.min(minX, positions[i]);
            minY = Math.min(minY, positions[i + 1]);
            minZ = Math.min(minZ, positions[i + 2]);
            maxX = Math.max(maxX, positions[i]);
            maxY = Math.max(maxY, positions[i + 1]);
            maxZ = Math.max(maxZ, positions[i + 2]);
        }

        this._bbox = [[minX, minY, minZ], [maxX, maxY, maxZ]];
        return this._bbox;
    }

    intersection(bspB: BSPNode): 'inside' | 'intersect' | 'outside' {
        const bspA = this._bsp!;

        // 1. 快速检测 - 检查包围盒关系
        const bboxA = this.getBSPBoundingBox(bspA);
        const bboxB = this.getBSPBoundingBox(bspB);
        const bboxRelation = this.checkBBoxRelation(bboxA, bboxB);

        if (bboxRelation === 'outside') return 'outside';
        if (bboxRelation === 'inside') return 'inside';

        // 2. 精确检测 - 递归遍历BSP树
        return this.recursiveBSPIntersection(bspA, bspB);
    }

    // 递归检测优化（带空间剪枝）
    private recursiveBSPIntersection(a: BSPNode, b: BSPNode): 'inside' | 'intersect' | 'outside' {
        // 空节点快速返回
        if (a.polygons.length === 0 || b.polygons.length === 0) {
            return 'outside';
        }

        // 多边形相交检测（优化版）
        for (const polyA of a.polygons) {
            for (const polyB of b.polygons) {
                if (this.polygonsIntersect(polyA, polyB)) {
                    return 'intersect';
                }
            }
        }

        // 递归子树（优先检测同侧子树）
        let result: 'inside' | 'intersect' | 'outside' = 'outside';

        // 检测共侧子树组合
        if (a.front && b.front) {
            result = this.mergeResults(result, this.recursiveBSPIntersection(a.front, b.front));
        }
        if (a.back && b.back) {
            result = this.mergeResults(result, this.recursiveBSPIntersection(a.back, b.back));
        }

        // 检测交叉子树组合
        if (result !== 'intersect') {
            if (a.front && b.back) {
                result = this.mergeResults(result, this.recursiveBSPIntersection(a.front, b.back));
            }
            if (a.back && b.front) {
                result = this.mergeResults(result, this.recursiveBSPIntersection(a.back, b.front));
            }
        }

        return result;
    }

    // 结果合并策略
    private mergeResults(a: 'inside' | 'intersect' | 'outside',
        b: 'inside' | 'intersect' | 'outside'): 'inside' | 'intersect' | 'outside' {
        if (a === 'intersect' || b === 'intersect') return 'intersect';
        if (a === 'inside' && b === 'inside') return 'inside';
        if (a === 'outside') return b;
        return a;
    }

    private checkBBoxRelation(a: THREE.Box3, b: THREE.Box3): 'inside' | 'outside' | 'intersect' {
        if (a[1][0] < b[0][0] || a[0][0] > b[1][0] ||
            a[1][1] < b[0][1] || a[0][1] > b[1][1] ||
            a[1][2] < b[0][2] || a[0][2] > b[1][2]) {
            return 'outside';
        }

        if (a[0][0] >= b[0][0] && a[1][0] <= b[1][0] &&
            a[0][1] >= b[0][1] && a[1][1] <= b[1][1] &&
            a[0][2] >= b[0][2] && a[1][2] <= b[1][2]) {
            return 'inside';
        }

        return 'intersect';
    }

    // 高效多边形相交检测
    private polygonsIntersect(a: Polygon, b: Polygon): boolean {
        // 1. 平面平行检测
        const normalA = a.plane.normal;
        const normalB = b.plane.normal;
        const parallel = Math.abs(dot(normalA, normalB)) > 0.99;

        // 2. 快速分离轴测试
        if (!parallel && this.polygonsSeparated(a, b)) {
            return false;
        }

        // 3. 精确边相交检测
        return this.checkEdgeIntersections(a, b);
    }

    // 检查两个多边形的边是否相交
    private checkEdgeIntersections(a: Polygon, b: Polygon): boolean {
        const edgesA = this.getPolygonEdges(a);
        const edgesB = this.getPolygonEdges(b);

        for (const edgeA of edgesA) {
            for (const edgeB of edgesB) {
                if (this.segmentsIntersect(edgeA, edgeB)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 获取多边形的所有边
     * @param poly 输入多边形
     * @returns 返回多边形边的数组，每条边由两个顶点组成
     */
    private getPolygonEdges(poly: Polygon): [Vector, Vector][] {
        const edges: [Vector, Vector][] = [];

        // 遍历多边形顶点，连接相邻顶点形成边
        for (let i = 0; i < poly.vectors.length; i++) {
            const current = poly.vectors[i];
            const next = poly.vectors[(i + 1) % poly.vectors.length]; // 循环连接首尾顶点

            // 跳过长度为零的边
            if (lengthV(minus(next, current)) > 1e-6) {
                edges.push([current, next]);
            }
        }

        return edges;
    }

    // 分离轴定理实现多边形分离检测
    private polygonsSeparated(a: Polygon, b: Polygon): boolean {
        // 获取所有需要测试的轴
        const axes = this.getSeparatingAxes(a, b);

        for (const axis of axes) {
            // 计算两个多边形在当前轴上的投影
            const projA = this.projectPolygon(a, axis);
            const projB = this.projectPolygon(b, axis);

            // 检查投影是否重叠
            if (projA.max < projB.min || projB.max < projA.min) {
                return true; // 存在分离轴
            }
        }
        return false; // 所有轴上都重叠
    }

    // 获取所有可能的分离轴
    private getSeparatingAxes(a: Polygon, b: Polygon): Vector[] {
        const axes: Vector[] = [];

        // 添加多边形A的边法线
        for (let i = 0; i < a.vectors.length; i++) {
            const p1 = a.vectors[i];
            const p2 = a.vectors[(i + 1) % a.vectors.length];
            const edge = minus(p2, p1);
            const normal = this.getEdgeNormal(edge);
            axes.push(normal);
        }

        // 添加多边形B的边法线
        for (let i = 0; i < b.vectors.length; i++) {
            const p1 = b.vectors[i];
            const p2 = b.vectors[(i + 1) % b.vectors.length];
            const edge = minus(p2, p1);
            const normal = this.getEdgeNormal(edge);
            axes.push(normal);
        }

        return axes;
    }

    // 计算边的法线（垂直于边的向量）
    private getEdgeNormal(edge: Vector): Vector {
        // 返回垂直于XY平面的向量（2D情况）
        return { x: -edge.y, y: edge.x, z: 0, metadata: undefined };
    }

    // 计算多边形在轴上的投影
    private projectPolygon(poly: Polygon, axis: Vector): { min: number, max: number } {
        let min = Infinity;
        let max = -Infinity;

        for (const vec of poly.vectors) {
            const proj = dot(vec, axis);
            min = Math.min(min, proj);
            max = Math.max(max, proj);
        }

        return { min, max };
    }

    // 检查两条线段是否相交
    private segmentsIntersect(seg1: [Vector, Vector], seg2: [Vector, Vector]): boolean {
        const [a, b] = seg1;
        const [c, d] = seg2;

        // 计算方向向量
        const ab = minus(b, a);
        const cd = minus(d, c);
        const ac = minus(c, a);

        // 计算叉积
        const crossABxCD = cross(ab, cd);

        // 检查是否共线
        if (Math.abs(dot(ac, crossABxCD)) > 1e-6) {
            return false;
        }

        // 计算参数
        const t = dot(cross(ac, cd), crossABxCD) / dot(crossABxCD, crossABxCD);
        const u = dot(cross(ac, ab), crossABxCD) / dot(crossABxCD, crossABxCD);

        // 检查交点是否在线段上
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    private getBSPBoundingBox(node: BSPNode): THREE.Box3 {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        // 遍历所有多边形获取包围盒
        const collectPolygons = (n: BSPNode) => {
            n.polygons.forEach(poly => {
                poly.vectors.forEach(v => {
                    minX = Math.min(minX, v.x);
                    minY = Math.min(minY, v.y);
                    minZ = Math.min(minZ, v.z);
                    maxX = Math.max(maxX, v.x);
                    maxY = Math.max(maxY, v.y);
                    maxZ = Math.max(maxZ, v.z);
                });
            });
            if (n.front) collectPolygons(n.front);
            if (n.back) collectPolygons(n.back);
        };

        collectPolygons(node);
        return [[minX, minY, minZ], [maxX, maxY, maxZ]];
    }

}