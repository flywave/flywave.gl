import { Polygon, triangulate } from "@flywave/flywave-geometry";
import { fromVectors } from "@flywave/flywave-geoutils";
import * as THREE from "three";

import { BspObject } from "./BspObject";

export class CollapsePillar extends BspObject {
    private readonly _id: string;
    private readonly _name: string;
    private readonly _lithology: string;
    private readonly _topCenter: THREE.Vector3;
    private readonly _baseCenter: THREE.Vector3;
    private readonly _topRadius: number;
    private readonly _baseRadius: number;
    private readonly _height: number;
    private readonly _stratumId: string;
    private _bbox?: THREE.Box3;
    private _geometry?: THREE.BufferGeometry;
    private _material?: THREE.Material;

    constructor(
        collapse: {
            id: string;
            name: string;
            topCenter: [number, number, number];
            baseCenter: [number, number, number];
            topRadius: number;
            baseRadius: number;
            height: number;
            stratumId: string;
            lithology: string;
        },
        bbox?: THREE.Box3,
        geometry?: THREE.BufferGeometry,
        material?: THREE.Material
    ) {
        super();
        this._id = collapse.id;
        this._name = collapse.name;
        this._lithology = collapse.lithology;
        this._topCenter = new THREE.Vector3().fromArray(collapse.topCenter);
        this._baseCenter = new THREE.Vector3().fromArray(collapse.baseCenter);
        this._topRadius = collapse.topRadius;
        this._baseRadius = collapse.baseRadius;
        this._height = collapse.height;
        this._stratumId = collapse.stratumId;
        this._bbox = bbox;
        this._geometry = geometry;
        this._material = material;
        this._bsp = this.buildBsp();
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

    dispose() {
        if (this._geometry) {
            this._geometry.dispose();
        }
        if (this._material) {
            this._material.dispose();
        }
        this._geometry = undefined;
        this._material = undefined;
        this._bsp = undefined;
        this._bbox = undefined;
    }

    // 更新后的横截面生成方法（增加 upDir 参数）
    generateCrossSections(
        line: [THREE.Vector3, THREE.Vector3],
        upDir: THREE.Vector3 // 新增：定义当前坐标系的向上方向
    ): { positions: THREE.Vector3[]; indices: number[][] } | undefined {
        // 使用传入的 upDir 创建竖直平面
        const plane = this.createVerticalPlane(line, upDir);
        const points = this.calculateIntersection(plane); // 传入平面对象

        if (points.length < 3) return;

        const sortedPoints = this.sortPolygonPoints(points, plane, upDir); // 传入 upDir
        return triangulate(sortedPoints);
    }

    // 修改：增加 upDir 参数
    private createVerticalPlane(
        line: [THREE.Vector3, THREE.Vector3],
        upDir: THREE.Vector3
    ): THREE.Plane {
        const dir = new THREE.Vector3().subVectors(line[1], line[0]);

        // 计算水平方向分量（垂直于 upDir）
        const horizontalDir = new THREE.Vector3().crossVectors(dir, upDir);

        // 处理特殊情况：如果水平方向分量太小，使用默认方向
        if (horizontalDir.length() < 1e-10) {
            // 尝试构造一个垂直于 upDir 的默认方向
            const temp = new THREE.Vector3(1, 0, 0);
            if (Math.abs(temp.dot(upDir)) > 0.9) temp.set(0, 1, 0);
            horizontalDir.crossVectors(upDir, temp).normalize();
        } else {
            horizontalDir.normalize();
        }

        // 创建法向量（垂直于水平方向）
        const normal = new THREE.Vector3().crossVectors(upDir, horizontalDir).normalize();
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(normal, line[0]);
        return plane;
    }

    // 修改：直接接收平面对象
    private calculateIntersection(plane: THREE.Plane): THREE.Vector3[] {
        if (!this._geometry) return [];

        const positionAttr = this._geometry.getAttribute("position");
        const indexAttr = this._geometry.getIndex();
        const positions = positionAttr.array;
        const indices = indexAttr?.array || [];

        const uniquePoints = new Map<string, THREE.Vector3>();
        const addUniquePoint = (point: THREE.Vector3) => {
            const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
            if (!uniquePoints.has(key)) {
                uniquePoints.set(key, point);
            }
        };

        for (let i = 0; i < indices.length; i += 3) {
            const idx0 = indices[i] * 3;
            const idx1 = indices[i + 1] * 3;
            const idx2 = indices[i + 2] * 3;

            const v0 = new THREE.Vector3(positions[idx0], positions[idx0 + 1], positions[idx0 + 2]);
            const v1 = new THREE.Vector3(positions[idx1], positions[idx1 + 1], positions[idx1 + 2]);
            const v2 = new THREE.Vector3(positions[idx2], positions[idx2 + 1], positions[idx2 + 2]);

            const edges = [
                new THREE.Line3(v0, v1),
                new THREE.Line3(v1, v2),
                new THREE.Line3(v2, v0)
            ];

            edges.forEach(edge => {
                const intersectPoint = new THREE.Vector3();
                const result = plane.intersectLine(edge, intersectPoint);
                if (result !== null) {
                    addUniquePoint(intersectPoint);
                }
            });
        }
        return Array.from(uniquePoints.values());
    }

    // 修改：增加 upDir 参数
    private sortPolygonPoints(
        points: THREE.Vector3[],
        plane: THREE.Plane,
        upDir: THREE.Vector3
    ): THREE.Vector3[] {
        if (points.length < 3) return points;

        // 1. 计算中心点
        const centroid = new THREE.Vector3();
        points.forEach(p => centroid.add(p));
        centroid.divideScalar(points.length);

        // 2. 构建平面坐标系
        // X 轴：平面法线与 upDir 的叉积（水平方向）
        const basisX = new THREE.Vector3().crossVectors(plane.normal, upDir).normalize();

        // 处理特殊情况
        if (basisX.length() < 1e-5) {
            // 如果法线与 upDir 平行，使用备用方向
            const temp = new THREE.Vector3(1, 0, 0);
            if (Math.abs(temp.dot(upDir)) > 0.9) temp.set(0, 1, 0);
            basisX.crossVectors(plane.normal, temp).normalize();
        }

        // Y 轴：使用 upDir（竖直方向）
        const basisY = upDir.clone().normalize();

        // 3. 投影到2D平面
        const projectTo2D = (v: THREE.Vector3) => {
            const offset = v.clone().sub(centroid);
            return {
                x: offset.dot(basisX),
                y: offset.dot(basisY)
            };
        };

        // 4. 使用角度排序
        return points.sort((a, b) => {
            const a2D = projectTo2D(a);
            const b2D = projectTo2D(b);
            const angleA = Math.atan2(a2D.y, a2D.x);
            const angleB = Math.atan2(b2D.y, b2D.x);

            if (Math.abs(angleA - angleB) < 1e-5) {
                return a2D.x * a2D.x + a2D.y * a2D.y - (b2D.x * b2D.x + b2D.y * b2D.y);
            }
            return angleA - angleB;
        });
    }

    protected polygonsToGeometry(polygons: readonly Polygon[]): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        const positions: number[] = [];
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

            // 添加顶点数据
            for (let i = 0; i < poly.vectors.length; i++) {
                const vec = poly.vectors[i];
                positions.push(vec.x, vec.y, vec.z);

                // 添加法线（平坦着色）
                normals.push(faceNormal.x, faceNormal.y, faceNormal.z);

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

        geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));

        geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));

        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        return geometry;
    }

    protected buildPolygons(): Polygon[] {
        if (!this.geometry) {
            return [];
        }

        const polygons: Polygon[] = [];
        const positionAttr = this.geometry.getAttribute("position");
        const indexAttr = this.geometry.getIndex();
        const positions = positionAttr.array;
        const indices = indexAttr?.array;

        if (!positions || !indices) {
            return [];
        }

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i] * 3;
            const i1 = indices[i + 1] * 3;
            const i2 = indices[i + 2] * 3;

            const vectors = [
                new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]),
                new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]),
                new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2])
            ];

            const plane = fromVectors(vectors);
            polygons.push({ vectors, plane });
        }

        return polygons;
    }
}
