import {
    BufferGeometry,
    BufferAttribute,
    Vector2,
    Vector3,
    Box3,
    Plane,
    Ray,
} from 'three';
import earcut from 'earcut';
import { Projection } from '@flywave/flywave-geoutils';

export const ArcType = {
    GEODESIC: 0,
    RHUMB: 1,
    NONE: 2
} as const;

export const WindingOrder = {
    CLOCKWISE: 0,
    COUNTER_CLOCKWISE: 1
} as const;

export interface PolygonHierarchy {
    positions: Vector3[];
    holes?: PolygonHierarchy[];
}

export interface VertexFormat {
    position?: boolean;
    normal?: boolean;
    uv?: boolean;
    tangent?: boolean;
    bitangent?: boolean;
    color?: boolean;
}

export interface PolygonGeometryOptions {
    polygonHierarchy: PolygonHierarchy;
    height?: number;
    extrudedHeight?: number;
    vertexFormat?: VertexFormat;
    stRotation?: number;
    projection: Projection;
    granularity?: number;
    perPositionHeight?: boolean;
    closeTop?: boolean;
    closeBottom?: boolean;
    arcType?: number;
    shadowVolume?: boolean;
}

class GeometryPipeline {
    /**
     * Compute vertex normals for geometry
     * 计算几何体顶点法线
     */
    static computeNormal(geometry: BufferGeometry): BufferGeometry {
        const positionAttribute = geometry.getAttribute('position');
        if (!positionAttribute) return geometry;

        const positions = positionAttribute.array as Float32Array;
        const indices = geometry.getIndex()?.array as Uint32Array | Uint16Array;

        if (!indices || indices.length < 3) {
            return geometry;
        }

        const numVertices = positions.length / 3;
        const normals = new Float32Array(numVertices * 3).fill(0);

        const v0 = new Vector3();
        const v1 = new Vector3();
        const v2 = new Vector3();
        const normal = new Vector3();

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i] * 3;
            const i1 = indices[i + 1] * 3;
            const i2 = indices[i + 2] * 3;

            v0.fromArray(positions, i0);
            v1.fromArray(positions, i1);
            v2.fromArray(positions, i2);

            v1.sub(v0);
            v2.sub(v0);
            normal.crossVectors(v1, v2).normalize();

            for (let j = 0; j < 3; j++) {
                const idx = indices[i + j] * 3;
                normals[idx] += normal.x;
                normals[idx + 1] += normal.y;
                normals[idx + 2] += normal.z;
            }
        }

        for (let i = 0; i < numVertices; i++) {
            const idx = i * 3;
            normal.set(normals[idx], normals[idx + 1], normals[idx + 2]).normalize();
            normals[idx] = normal.x;
            normals[idx + 1] = normal.y;
            normals[idx + 2] = normal.z;
        }

        geometry.setAttribute('normal', new BufferAttribute(normals, 3));
        return geometry;
    }

    /**
     * Convert geometry to wireframe
     * 将几何体转换为线框
     */
    static toWireframe(geometry: BufferGeometry): BufferGeometry {
        const indices = geometry.getIndex();
        if (!indices) return geometry;

        const indexArray = indices.array;
        const wireframeIndices: number[] = [];

        for (let i = 0; i < indexArray.length; i += 3) {
            const a = indexArray[i];
            const b = indexArray[i + 1];
            const c = indexArray[i + 2];

            wireframeIndices.push(a, b, b, c, c, a);
        }

        const wireframeGeometry = geometry.clone();
        wireframeGeometry.setIndex(wireframeIndices);
        return wireframeGeometry;
    }
}

class PolygonPipeline {
    /**
     * Compute 2D polygon area
     * 计算2D多边形面积
     */
    static computeArea2D(positions: Vector2[]): number {
        let area = 0.0;
        const length = positions.length;

        for (let i0 = length - 1, i1 = 0; i1 < length; i0 = i1++) {
            const v0 = positions[i0];
            const v1 = positions[i1];
            area += v0.x * v1.y - v1.x * v0.y;
        }

        return area * 0.5;
    }

    /**
     * Determine polygon winding order
     * 确定多边形缠绕顺序
     */
    static computeWindingOrder2D(positions: Vector2[]): number {
        const area = this.computeArea2D(positions);
        return area > 0.0 ? WindingOrder.COUNTER_CLOCKWISE : WindingOrder.CLOCKWISE;
    }

    /**
     * Triangulate polygon using earcut
     * 使用Earcut算法三角化多边形
     */
    static triangulate(positions: Vector2[], holes?: number[]): number[] {
        const flattened: number[] = [];
        positions.forEach(pos => {
            flattened.push(pos.x, pos.y);
        });
        return earcut(flattened, holes, 2);
    }

    /**
     * Subdivide geometry based on granularity
     * 根据粒度细分几何体
     */
    static computeSubdivision(
        projection: Projection,
        positions: Vector3[],
        indices: number[],
        texcoords?: Vector2[],
        granularity?: number
    ): BufferGeometry {
        granularity = granularity || Math.PI / 180.0;
        const hasTexcoords = !!texcoords;

        const triangles = indices.slice();
        const length = positions.length;

        const subdividedPositions: number[] = [];
        const subdividedTexcoords: number[] = [];

        for (let i = 0; i < length; i++) {
            const item = positions[i];
            subdividedPositions.push(item.x, item.y, item.z);

            if (hasTexcoords && texcoords) {
                const texcoordItem = texcoords[i];
                subdividedTexcoords.push(texcoordItem.x, texcoordItem.y);
            }
        }

        const subdividedIndices: number[] = [];
        const edges: Record<string, number> = {};

        const radius = 6378137.0;
        const minDistance = this.chordLength(granularity, radius);
        const minDistanceSqrd = minDistance * minDistance;

        const v0 = new Vector3();
        const v1 = new Vector3();
        const v2 = new Vector3();
        const s0 = new Vector3();
        const s1 = new Vector3();
        const s2 = new Vector3();
        const mid = new Vector3();

        while (triangles.length > 0) {
            const i2 = triangles.pop()!;
            const i1 = triangles.pop()!;
            const i0 = triangles.pop()!;

            v0.fromArray(subdividedPositions, i0 * 3);
            v1.fromArray(subdividedPositions, i1 * 3);
            v2.fromArray(subdividedPositions, i2 * 3);

            s0.copy(v0).normalize().multiplyScalar(radius);
            s1.copy(v1).normalize().multiplyScalar(radius);
            s2.copy(v2).normalize().multiplyScalar(radius);

            const g0 = s0.distanceToSquared(s1);
            const g1 = s1.distanceToSquared(s2);
            const g2 = s2.distanceToSquared(s0);

            const max = Math.max(g0, g1, g2);
            let edge: string;
            let i: number;

            if (max > minDistanceSqrd) {
                if (g0 === max) {
                    edge = `${Math.min(i0, i1)} ${Math.max(i0, i1)}`;

                    i = edges[edge];
                    if (i === undefined) {
                        mid.addVectors(v0, v1).multiplyScalar(0.5);
                        subdividedPositions.push(mid.x, mid.y, mid.z);
                        i = subdividedPositions.length / 3 - 1;
                        edges[edge] = i;

                        if (hasTexcoords && texcoords) {
                            const t0 = new Vector2().fromArray(subdividedTexcoords, i0 * 2);
                            const t1 = new Vector2().fromArray(subdividedTexcoords, i1 * 2);
                            const midTexcoord = new Vector2().addVectors(t0, t1).multiplyScalar(0.5);
                            subdividedTexcoords.push(midTexcoord.x, midTexcoord.y);
                        }
                    }

                    triangles.push(i0, i, i2);
                    triangles.push(i, i1, i2);
                } else if (g1 === max) {
                    edge = `${Math.min(i1, i2)} ${Math.max(i1, i2)}`;

                    i = edges[edge];
                    if (i === undefined) {
                        mid.addVectors(v1, v2).multiplyScalar(0.5);
                        subdividedPositions.push(mid.x, mid.y, mid.z);
                        i = subdividedPositions.length / 3 - 1;
                        edges[edge] = i;

                        if (hasTexcoords && texcoords) {
                            const t1 = new Vector2().fromArray(subdividedTexcoords, i1 * 2);
                            const t2 = new Vector2().fromArray(subdividedTexcoords, i2 * 2);
                            const midTexcoord = new Vector2().addVectors(t1, t2).multiplyScalar(0.5);
                            subdividedTexcoords.push(midTexcoord.x, midTexcoord.y);
                        }
                    }

                    triangles.push(i1, i, i0);
                    triangles.push(i, i2, i0);
                } else if (g2 === max) {
                    edge = `${Math.min(i2, i0)} ${Math.max(i2, i0)}`;

                    i = edges[edge];
                    if (i === undefined) {
                        mid.addVectors(v2, v0).multiplyScalar(0.5);
                        subdividedPositions.push(mid.x, mid.y, mid.z);
                        i = subdividedPositions.length / 3 - 1;
                        edges[edge] = i;

                        if (hasTexcoords && texcoords) {
                            const t2 = new Vector2().fromArray(subdividedTexcoords, i2 * 2);
                            const t0 = new Vector2().fromArray(subdividedTexcoords, i0 * 2);
                            const midTexcoord = new Vector2().addVectors(t2, t0).multiplyScalar(0.5);
                            subdividedTexcoords.push(midTexcoord.x, midTexcoord.y);
                        }
                    }

                    triangles.push(i2, i, i1);
                    triangles.push(i, i0, i1);
                }
            } else {
                subdividedIndices.push(i0, i1, i2);
            }
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(subdividedPositions), 3));
        geometry.setIndex(subdividedIndices);

        if (hasTexcoords) {
            geometry.setAttribute('uv', new BufferAttribute(new Float32Array(subdividedTexcoords), 2));
        }

        return geometry;
    }

    private static chordLength(angle: number, radius: number): number {
        return 2.0 * radius * Math.sin(angle * 0.5);
    }

    /**
     * Scale positions to geodetic height
     * 将位置缩放到大地高度
     */
    static scaleToGeodeticHeight(
        positions: number[],
        height: number = 0.0,
        projection: Projection,
        scaleToSurface: boolean = true
    ): number[] {
        const p = new Vector3();

        if (positions) {
            const length = positions.length;

            for (let i = 0; i < length; i += 3) {
                p.fromArray(positions, i);

                if (scaleToSurface) {
                    projection.scalePointToSurface(p);
                }

                if (height !== 0) {
                    const normal = new Vector3().copy(projection.surfaceNormal(p));
                    normal.multiplyScalar(height);
                    p.add(normal);
                }

                positions[i] = p.x;
                positions[i + 1] = p.y;
                positions[i + 2] = p.z;
            }
        }

        return positions;
    }
}

class EllipsoidTangentPlane {
    private _projection: Projection;
    private _origin: Vector3;
    private _xAxis: Vector3;
    private _yAxis: Vector3;
    private _zAxis: Vector3;
    private _plane: Plane;

    constructor(origin: Vector3, projection?: Projection) {
        this._projection = projection;

        this._origin = origin.clone();
        this._projection.scalePointToSurface(this._origin);

        const normal = this._projection.surfaceNormal(this._origin, new Vector3());
        this._zAxis = normal.clone();

        const east = new Vector3(0, 0, 1).cross(normal);
        if (east.lengthSq() < 1e-10) {
            east.set(1, 0, 0);
        }
        east.normalize();
        this._xAxis = east;

        this._yAxis = new Vector3().crossVectors(normal, east).normalize();

        this._plane = new Plane(normal, -normal.dot(this._origin));
    }

    projectPointOntoPlane(cartesian: Vector3, result?: Vector2): Vector2 {
        const ray = new Ray(cartesian, cartesian.clone().normalize());
        const intersectionPoint = new Vector3();

        if (ray.intersectPlane(this._plane, intersectionPoint)) {
            const v = new Vector3().subVectors(intersectionPoint, this._origin);
            const x = v.dot(this._xAxis);
            const y = v.dot(this._yAxis);

            if (result) {
                result.set(x, y);
                return result;
            }
            return new Vector2(x, y);
        }

        return this.projectPointToNearestOnPlane(cartesian, result);
    }

    projectPointToNearestOnPlane(cartesian: Vector3, result?: Vector2): Vector2 {
        const closestPoint = new Vector3();
        this._plane.projectPoint(cartesian, closestPoint);

        const v = new Vector3().subVectors(closestPoint, this._origin);
        const x = v.dot(this._xAxis);
        const y = v.dot(this._yAxis);

        if (result) {
            result.set(x, y);
            return result;
        }
        return new Vector2(x, y);
    }

    projectPointsOntoPlane(cartesians: Vector3[], result?: Vector2[]): Vector2[] {
        if (!result) {
            result = [];
        }

        result.length = 0;
        for (const cartesian of cartesians) {
            const projected = this.projectPointOntoPlane(cartesian);
            if (projected) {
                result.push(projected);
            }
        }

        return result;
    }

    projectPointOntoEllipsoid(cartesian: Vector2, result?: Vector3): Vector3 {
        const point = result || new Vector3();

        point.copy(this._origin)
            .add(this._xAxis.clone().multiplyScalar(cartesian.x))
            .add(this._yAxis.clone().multiplyScalar(cartesian.y));

        return new Vector3().copy(this._projection.scalePointToSurface(point));
    }
}

export class PolygonGeometry {
    private _polygonHierarchy: PolygonHierarchy;
    private _height: number;
    private _extrudedHeight: number;
    private _vertexFormat: VertexFormat;
    private _projection: Projection;
    private _granularity: number;
    private _perPositionHeight: boolean;
    private _closeTop: boolean;
    private _closeBottom: boolean;
    private _arcType: number;
    private _shadowVolume: boolean;
    private _stRotation: number;

    constructor(options: PolygonGeometryOptions) {
        this._polygonHierarchy = options.polygonHierarchy;
        this._height = options.height ?? 0.0;
        this._extrudedHeight = options.extrudedHeight ?? this._height;
        this._vertexFormat = options.vertexFormat ?? {
            position: true,
            normal: false,
            uv: false,
            tangent: false,
            bitangent: false
        };
        this._projection = options.projection;
        this._granularity = options.granularity ?? Math.PI / 180.0;
        this._perPositionHeight = options.perPositionHeight ?? false;
        this._closeTop = options.closeTop ?? true;
        this._closeBottom = options.closeBottom ?? true;
        this._arcType = options.arcType ?? ArcType.GEODESIC;
        this._shadowVolume = options.shadowVolume ?? false;
        this._stRotation = options.stRotation ?? 0.0;
    }

    /**
     * Create Three.js BufferGeometry from PolygonGeometry
     * 从PolygonGeometry创建Three.js BufferGeometry
     */
    static createGeometry(geometry: PolygonGeometry): BufferGeometry {
        const polygonHierarchy = geometry._polygonHierarchy;
        const projection = geometry._projection;
        const height = geometry._height;
        const extrudedHeight = geometry._extrudedHeight;
        const vertexFormat = geometry._vertexFormat;
        const perPositionHeight = geometry._perPositionHeight;
        const closeTop = geometry._closeTop;
        const closeBottom = geometry._closeBottom;

        if (!polygonHierarchy.positions || polygonHierarchy.positions.length < 3) {
            throw new Error('At least three positions are required.');
        }

        if (height !== extrudedHeight) {
            return PolygonGeometry.createExtrudedPolygonGeometry(
                polygonHierarchy,
                height,
                extrudedHeight,
                vertexFormat,
                projection,
                perPositionHeight,
                closeTop,
                closeBottom
            );
        } else {
            return PolygonGeometry.createFlatPolygonGeometry(
                polygonHierarchy,
                height,
                vertexFormat,
                projection,
                perPositionHeight,
            );
        }
    }

    private static createFlatPolygonGeometry(
        polygonHierarchy: PolygonHierarchy,
        height: number,
        vertexFormat: VertexFormat,
        projection: Projection,
        perPositionHeight: boolean,
    ): BufferGeometry {
        const positions2D = this.projectPositionsTo2D(polygonHierarchy, projection);
        if (!positions2D) {
            throw new Error('Unable to project positions to 2D.');
        }

        const indices = this.triangulatePolygon(polygonHierarchy, positions2D);
        const flattenedPositions = this.generatePositions(polygonHierarchy, height, perPositionHeight, projection);

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(flattenedPositions), 3));
        geometry.setIndex(indices);

        if (vertexFormat.normal) {
            GeometryPipeline.computeNormal(geometry);
        }

        if (vertexFormat.uv) {
            const uvAttribute = this.generateTextureCoordinates(geometry, polygonHierarchy);
            geometry.setAttribute('uv', uvAttribute);
        }

        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();

        return geometry;
    }

    private static createExtrudedPolygonGeometry(
        polygonHierarchy: PolygonHierarchy,
        height: number,
        extrudedHeight: number,
        vertexFormat: VertexFormat,
        projection: Projection,
        perPositionHeight: boolean,
        closeTop: boolean,
        closeBottom: boolean
    ): BufferGeometry {
        if (height === extrudedHeight) {
            throw new Error('Height and extrudedHeight must be different for extrusion.');
        }

        const topGeometry = this.createFlatPolygonGeometry(
            polygonHierarchy,
            extrudedHeight,
            vertexFormat,
            projection,
            perPositionHeight,
        );

        const bottomGeometry = this.createFlatPolygonGeometry(
            polygonHierarchy,
            height,
            vertexFormat,
            projection,
            perPositionHeight,
        );

        const wallGeometry = this.generateWallGeometry(
            polygonHierarchy,
            height,
            extrudedHeight,
            vertexFormat,
            projection,
            perPositionHeight
        );

        return this.mergeExtrudedGeometries(
            topGeometry,
            bottomGeometry,
            wallGeometry,
            closeTop,
            closeBottom,
            vertexFormat
        );
    }

    private static generateWallGeometry(
        polygonHierarchy: PolygonHierarchy,
        height: number,
        extrudedHeight: number,
        vertexFormat: VertexFormat,
        projection: Projection,
        perPositionHeight: boolean
    ): BufferGeometry {
        const wallGeometry = new BufferGeometry();
        const wallPositions: number[] = [];
        const wallNormals: number[] = [];
        const wallUVs: number[] = [];
        const wallIndices: number[] = [];

        const processRing = (ringPositions: Vector3[], isOuterRing: boolean) => {
            const numPositions = ringPositions.length;

            for (let i = 0; i < numPositions; i++) {
                const current = ringPositions[i];
                const next = ringPositions[(i + 1) % numPositions];

                const bottomCurrent = this.computePosition(current, height, perPositionHeight, projection);
                const topCurrent = this.computePosition(current, extrudedHeight, perPositionHeight, projection);
                const bottomNext = this.computePosition(next, height, perPositionHeight, projection);
                const topNext = this.computePosition(next, extrudedHeight, perPositionHeight, projection);

                const startIndex = wallPositions.length / 3;

                wallPositions.push(
                    bottomCurrent.x, bottomCurrent.y, bottomCurrent.z,
                    topCurrent.x, topCurrent.y, topCurrent.z,
                    bottomNext.x, bottomNext.y, bottomNext.z,
                    topNext.x, topNext.y, topNext.z
                );

                const normal = this.computeWallNormal(bottomCurrent, topCurrent, bottomNext, isOuterRing);

                for (let j = 0; j < 4; j++) {
                    wallNormals.push(normal.x, normal.y, normal.z);
                }

                const u0 = i / numPositions;
                const u1 = (i + 1) / numPositions;

                wallUVs.push(
                    u0, 0,
                    u0, 1,
                    u1, 0,
                    u1, 1
                );

                wallIndices.push(
                    startIndex,
                    startIndex + 1,
                    startIndex + 2
                );

                wallIndices.push(
                    startIndex + 1,
                    startIndex + 3,
                    startIndex + 2
                );
            }
        };

        processRing(polygonHierarchy.positions, true);

        if (polygonHierarchy.holes) {
            for (const hole of polygonHierarchy.holes) {
                processRing(hole.positions, false);
            }
        }

        wallGeometry.setAttribute('position', new BufferAttribute(new Float32Array(wallPositions), 3));

        if (vertexFormat.normal) {
            wallGeometry.setAttribute('normal', new BufferAttribute(new Float32Array(wallNormals), 3));
        }

        if (vertexFormat.uv) {
            wallGeometry.setAttribute('uv', new BufferAttribute(new Float32Array(wallUVs), 2));
        }

        wallGeometry.setIndex(wallIndices);

        return wallGeometry;
    }

    private static computeWallNormal(
        bottomCurrent: Vector3,
        topCurrent: Vector3,
        bottomNext: Vector3,
        isOuterRing: boolean
    ): Vector3 {
        const v0 = new Vector3().subVectors(topCurrent, bottomCurrent);
        const v1 = new Vector3().subVectors(bottomNext, bottomCurrent);

        let normal = new Vector3().crossVectors(v0, v1).normalize();

        if (!isOuterRing) {
            normal.negate();
        }

        return normal;
    }

    private static computePosition(position: Vector3, height: number, perPositionHeight: boolean, projection: Projection): Vector3 {
        if (perPositionHeight) {
            return position.clone();
        } else {
            const surfacePoint = position.clone();
            projection.scalePointToSurface(surfacePoint);

            const normal = new Vector3().copy(projection.surfaceNormal(surfacePoint));
            return surfacePoint.add(normal.multiplyScalar(height));
        }
    }

    private static mergeExtrudedGeometries(
        topGeometry: BufferGeometry,
        bottomGeometry: BufferGeometry,
        wallGeometry: BufferGeometry,
        closeTop: boolean,
        closeBottom: boolean,
        vertexFormat: VertexFormat
    ): BufferGeometry {
        const mergedGeometry = new BufferGeometry();
        const mergedPositions: number[] = [];
        const mergedNormals: number[] = [];
        const mergedUVs: number[] = [];
        const mergedIndices: number[] = [];

        let indexOffset = 0;

        if (closeTop) {
            this.appendGeometry(
                topGeometry,
                mergedPositions,
                mergedNormals,
                mergedUVs,
                mergedIndices,
                indexOffset,
                vertexFormat,
                new Vector3(0, 0, 1)
            );
            indexOffset += topGeometry.getAttribute('position').count;
        }

        if (closeBottom) {
            this.appendGeometry(
                bottomGeometry,
                mergedPositions,
                mergedNormals,
                mergedUVs,
                mergedIndices,
                indexOffset,
                vertexFormat,
                new Vector3(0, 0, -1)
            );
            indexOffset += bottomGeometry.getAttribute('position').count;
        }

        this.appendGeometry(
            wallGeometry,
            mergedPositions,
            mergedNormals,
            mergedUVs,
            mergedIndices,
            indexOffset,
            vertexFormat
        );

        mergedGeometry.setAttribute('position', new BufferAttribute(new Float32Array(mergedPositions), 3));

        if (vertexFormat.normal && mergedNormals.length > 0) {
            mergedGeometry.setAttribute('normal', new BufferAttribute(new Float32Array(mergedNormals), 3));
        }

        if (vertexFormat.uv && mergedUVs.length > 0) {
            mergedGeometry.setAttribute('uv', new BufferAttribute(new Float32Array(mergedUVs), 2));
        }

        mergedGeometry.setIndex(mergedIndices);
        mergedGeometry.computeBoundingSphere();
        mergedGeometry.computeBoundingBox();

        return mergedGeometry;
    }

    private static appendGeometry(
        sourceGeometry: BufferGeometry,
        targetPositions: number[],
        targetNormals: number[],
        targetUVs: number[],
        targetIndices: number[],
        indexOffset: number,
        vertexFormat: VertexFormat,
        overrideNormal?: Vector3
    ): void {
        const positions = sourceGeometry.getAttribute('position');
        const normals = sourceGeometry.getAttribute('normal');
        const uvs = sourceGeometry.getAttribute('uv');
        const indices = sourceGeometry.getIndex();

        for (let i = 0; i < positions.count; i++) {
            targetPositions.push(
                positions.getX(i),
                positions.getY(i),
                positions.getZ(i)
            );

            if (vertexFormat.normal) {
                if (overrideNormal) {
                    targetNormals.push(overrideNormal.x, overrideNormal.y, overrideNormal.z);
                } else if (normals) {
                    targetNormals.push(normals.getX(i), normals.getY(i), normals.getZ(i));
                }
            }

            if (vertexFormat.uv && uvs) {
                targetUVs.push(uvs.getX(i), uvs.getY(i));
            }
        }

        if (indices) {
            for (let i = 0; i < indices.count; i++) {
                targetIndices.push(indices.getX(i) + indexOffset);
            }
        }
    }

    private static projectPositionsTo2D(polygonHierarchy: PolygonHierarchy, projection: Projection): Vector2[] | undefined {
        if (polygonHierarchy.positions.length === 0) {
            return undefined;
        }

        const tangentPlane = new EllipsoidTangentPlane(polygonHierarchy.positions[0], projection);
        const allPositions2D: Vector2[] = [];

        const outerRing2D = tangentPlane.projectPointsOntoPlane(polygonHierarchy.positions);
        allPositions2D.push(...outerRing2D);

        if (polygonHierarchy.holes) {
            for (const hole of polygonHierarchy.holes) {
                const hole2D = tangentPlane.projectPointsOntoPlane(hole.positions);
                allPositions2D.push(...hole2D);
            }
        }

        return allPositions2D;
    }

    private static triangulatePolygon(polygonHierarchy: PolygonHierarchy, positions2D: Vector2[]): number[] {
        const vertices: number[] = [];
        const holes: number[] = [];

        const outerRingLength = polygonHierarchy.positions.length;
        for (let i = 0; i < outerRingLength; i++) {
            const pos2D = positions2D[i];
            vertices.push(pos2D.x, pos2D.y);
        }

        if (polygonHierarchy.holes) {
            let vertexCount = outerRingLength;

            for (const hole of polygonHierarchy.holes) {
                holes.push(vertexCount);

                for (let i = 0; i < hole.positions.length; i++) {
                    const pos2D = positions2D[vertexCount + i];
                    vertices.push(pos2D.x, pos2D.y);
                }

                vertexCount += hole.positions.length;
            }
        }

        return PolygonPipeline.triangulate(
            positions2D.slice(0, outerRingLength),
            holes.length > 0 ? holes : undefined
        );
    }

    private static generatePositions(
        polygonHierarchy: PolygonHierarchy,
        height: number,
        perPositionHeight: boolean,
        projection: Projection
    ): number[] {
        const positions: number[] = [];

        const processPosition = (position: Vector3) => {
            if (perPositionHeight) {
                positions.push(position.x, position.y, position.z);
            } else {
                const surfacePosition = position.clone();
                projection.scalePointToSurface(surfacePosition);
                const normal = new Vector3().copy(projection.surfaceNormal(position));
                const elevatedPosition = surfacePosition.add(normal.multiplyScalar(height));
                positions.push(elevatedPosition.x, elevatedPosition.y, elevatedPosition.z);
            }
        };

        for (const position of polygonHierarchy.positions) {
            processPosition(position);
        }

        if (polygonHierarchy.holes) {
            for (const hole of polygonHierarchy.holes) {
                for (const position of hole.positions) {
                    processPosition(position);
                }
            }
        }

        return positions;
    }

    private static generateTextureCoordinates(geometry: BufferGeometry, polygonHierarchy: PolygonHierarchy): BufferAttribute {
        const positions = geometry.getAttribute('position').array as Float32Array;
        const uvs: number[] = [];

        geometry.computeBoundingBox();
        const boundingBox = geometry.boundingBox;

        if (!boundingBox) {
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                uvs.push(
                    (x + 180) / 360,
                    (90 - y) / 180
                );
            }
        } else {
            const size = new Vector3();
            boundingBox.getSize(size);
            const min = boundingBox.min;

            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                const z = positions[i + 2];

                const u = size.x > 0 ? (x - min.x) / size.x : 0;
                const v = size.y > 0 ? (y - min.y) / size.y : 0;

                uvs.push(u, v);
            }
        }

        return new BufferAttribute(new Float32Array(uvs), 2);
    }

    /**
     * Create shadow volume geometry
     * 创建阴影体几何体
     */
    static createShadowVolume(geometry: PolygonGeometry, minHeight: number, maxHeight: number): PolygonGeometry {
        return new PolygonGeometry({
            polygonHierarchy: geometry._polygonHierarchy,
            height: maxHeight,
            extrudedHeight: minHeight,
            vertexFormat: {
                position: true,
                normal: false,
                uv: false,
                tangent: false,
                bitangent: false
            },
            projection: geometry._projection,
            perPositionHeight: false,
            shadowVolume: true
        });
    }

    /**
     * Compute bounding rectangle
     * 计算边界矩形
     */
    computeRectangle(): { west: number; south: number; east: number; north: number } {
        const positions = this._polygonHierarchy.positions;
        let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;

        for (const position of positions) {
            west = Math.min(west, position.x);
            east = Math.max(east, position.x);
            south = Math.min(south, position.y);
            north = Math.max(north, position.y);
        }

        return { west, south, east, north };
    }
}

export class PolygonBufferGeometry extends BufferGeometry {
    constructor(polygonGeometry: PolygonGeometry) {
        super();
        this.copy(PolygonGeometry.createGeometry(polygonGeometry));
    }

    /**
     * Create from positions array
     * 从位置数组创建
     */
    static fromPositions(positions: Vector3[], options?: Omit<PolygonGeometryOptions, 'polygonHierarchy'>): PolygonBufferGeometry {
        const polygonHierarchy: PolygonHierarchy = {
            positions: positions
        };

        const polygonGeometry = new PolygonGeometry({
            polygonHierarchy,
            ...options,
        });

        return new PolygonBufferGeometry(polygonGeometry);
    }
}

export default PolygonGeometry;