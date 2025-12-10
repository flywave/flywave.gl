/* Copyright (C) 2025 flywave.gl contributors */



import {
    type TextureMapping,
    MeshEdge,
    MeshEdges,
    MeshPolyline,
    OctEncodedNormal,
    OctEncodedNormalPair,
    QPoint3dList
} from "../../common";
import { type DisplayParams } from "../../common/render/primitives/display-params";
import {
    type IndexedPolyface,
    type Point2d,
    type Polyface,
    type PolyfaceVisitor,
    type Range3d,
    Angle,
    Point3d,
    Vector3d
} from "../../core-geometry";
import { assert, Dictionary } from "../../utils";
import { type TriangleKey, Triangle, TriangleSet } from "../primitives";
import { type StrokesPrimitivePointLists } from "../strokes";
import { type VertexKey, type VertexKeyProps, VertexMap } from "../vertex-key";
import { Mesh } from "./mesh-primitives";

type VertexKeyPropsWithIndex = VertexKeyProps & { sourceIndex: number };

export class MeshBuilder {
    public readonly vertexMap: VertexMap;
    private _triangleSet?: TriangleSet;
    private _currentPolyface?: MeshBuilderPolyface;
    public readonly mesh: Mesh;
    public readonly tolerance: number;
    public readonly areaTolerance: number;
    public readonly tileRange: Range3d;
    public get currentPolyface(): MeshBuilderPolyface | undefined {
        return this._currentPolyface;
    }

    public get displayParams(): DisplayParams {
        return this.mesh.displayParams;
    }

    public set displayParams(params: DisplayParams) {
        this.mesh.displayParams = params;
    }

    public get triangleSet(): TriangleSet {
        if (undefined === this._triangleSet) this._triangleSet = new TriangleSet();

        return this._triangleSet;
    }

    private constructor(mesh: Mesh, tolerance: number, areaTolerance: number, tileRange: Range3d) {
        this.mesh = mesh;
        this.tolerance = tolerance;
        this.areaTolerance = areaTolerance;
        this.tileRange = tileRange;

        let vertexTolerance;
        if (mesh.points instanceof QPoint3dList) {
            const p0 = mesh.points.params.unquantize(0, 0, 0);
            const p1 = mesh.points.params.unquantize(1, 1, 1);
            vertexTolerance = p1.minus(p0, p0);
        } else {
            vertexTolerance = { x: tolerance, y: tolerance, z: tolerance };
        }

        this.vertexMap = new VertexMap(vertexTolerance);
    }

    public static create(props: MeshBuilder.Props): MeshBuilder {
        const mesh = Mesh.create(props);
        const { tolerance, areaTolerance, range } = props;
        return new MeshBuilder(mesh, tolerance, areaTolerance, range);
    }

    public addStrokePointLists(
        strokes: StrokesPrimitivePointLists,
        isDisjoint: boolean,
        fillColor: number
    ): void {
        for (const strokePoints of strokes) {
            if (isDisjoint) this.addPointString(strokePoints.points, fillColor);
            else this.addPolyline(strokePoints.points, fillColor);
        }
    }

    public addFromPolyface(polyface: IndexedPolyface, props: MeshBuilder.PolyfaceOptions): void {
        this.beginPolyface(polyface, props.edgeOptions);
        const visitor = polyface.createVisitor();

        while (visitor.moveToNextFacet()) {
            this.addFromPolyfaceVisitor(visitor, props);
        }

        this.endPolyface();
    }

    public addFromPolyfaceVisitor(
        visitor: PolyfaceVisitor,
        options: MeshBuilder.PolyfaceOptions
    ): void {
        const { pointCount, normalCount, paramCount, requireNormals } = visitor;
        const { includeParams, mappedTexture } = options;

        const isDegenerate = requireNormals && normalCount < pointCount;

        if (pointCount < 3 || isDegenerate) return;

        const haveParam = includeParams && paramCount > 0;
        const triangleCount = pointCount - 2;

        assert(!includeParams || paramCount > 0);
        assert(!haveParam || undefined !== mappedTexture);

        const polyfaceVisitorOptions = { ...options, triangleCount, haveParam };
        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
            const triangle = this.createTriangle(triangleIndex, visitor, polyfaceVisitorOptions);
            if (undefined !== triangle) this.addTriangle(triangle);
        }
    }

    public createTriangleVertices(
        triangleIndex: number,
        visitor: PolyfaceVisitor,
        options: MeshBuilder.PolyfaceVisitorOptions
    ): VertexKeyPropsWithIndex[] | undefined {
        const { point, requireNormals } = visitor;
        const { fillColor, haveParam } = options;

        let params: Point2d[] | undefined;
        if (haveParam && options.mappedTexture) {
            assert(this.mesh.points.length === 0 || this.mesh.uvParams.length !== 0);
            const mappedTexture = options.mappedTexture;
            const transformToImodel = mappedTexture.params.textureMatrix.transform;
            if (transformToImodel) {
                params = mappedTexture.computeUVParams(visitor, transformToImodel);
            }
            assert(params !== undefined);
        }

        const vertices = [];
        for (let i = 0; i < 3; ++i) {
            const vertexIndex = i === 0 ? 0 : triangleIndex + i;
            const position = point.getPoint3dAtUncheckedPointIndex(vertexIndex);
            const normal = requireNormals
                ? OctEncodedNormal.fromVector(visitor.getNormal(vertexIndex)!)
                : undefined;
            const uvParam: Point2d | undefined = params ? params[vertexIndex] : undefined;
            vertices[i] = {
                position,
                fillColor,
                normal,
                uvParam,
                sourceIndex: vertexIndex
            };
        }

        if (
            this.vertexMap.arePositionsAlmostEqual(vertices[0], vertices[1]) ||
            this.vertexMap.arePositionsAlmostEqual(vertices[0], vertices[2]) ||
            this.vertexMap.arePositionsAlmostEqual(vertices[1], vertices[2])
        ) {
            return undefined;
        }

        return vertices;
    }

    public createTriangle(
        triangleIndex: number,
        visitor: PolyfaceVisitor,
        options: MeshBuilder.PolyfaceVisitorOptions
    ): Triangle | undefined {
        const vertices = this.createTriangleVertices(triangleIndex, visitor, options);

        if (undefined === vertices) return undefined;

        const { edgeVisible } = visitor;

        const triangle = new Triangle();

        triangle.setEdgeVisibility(
            triangleIndex === 0 ? edgeVisible[0] : false,
            edgeVisible[triangleIndex + 1],
            triangleIndex === options.triangleCount - 1 ? edgeVisible[triangleIndex + 2] : false
        );

        vertices.forEach((vertexProps, i: number) => {
            let vertexKeyIndex;
            if (visitor.auxData) {
                vertexKeyIndex = this.mesh.addVertex(vertexProps);
                this.mesh.addAuxChannels(visitor.auxData.channels, vertexProps.sourceIndex);
            } else {
                vertexKeyIndex = this.addVertex(vertexProps);
            }

            triangle.indices[i] = vertexKeyIndex;

            if (this.currentPolyface !== undefined) {
                this.currentPolyface.vertexIndexMap.set(
                    vertexKeyIndex,
                    visitor.clientPointIndex(vertexProps.sourceIndex)
                );
            }
        });

        return triangle;
    }

    public addPolyline(points: Point3d[], fillColor: number): void {
        const { mesh } = this;

        const poly = new MeshPolyline();
        for (const position of points) {
            poly.addIndex(this.addVertex({ position, fillColor }));
        }

        mesh.addPolyline(poly);
    }

    public addPointString(points: Point3d[], fillColor: number): void {
        const { mesh } = this;
        const poly = new MeshPolyline();

        for (const position of points) {
            poly.addIndex(this.addVertex({ position, fillColor }));
        }

        mesh.addPolyline(poly);
    }

    public beginPolyface(polyface: Polyface, options: MeshEdgeCreationOptions): void {
        if (!options.generateNoEdges) {
            const triangles = this.mesh.triangles;
            this._currentPolyface = new MeshBuilderPolyface(
                polyface,
                options,
                triangles === undefined ? 0 : triangles.length
            );
        }
    }

    public endPolyface(): void {
        const { currentPolyface, mesh } = this;
        if (undefined === currentPolyface) return;

        this._currentPolyface = undefined;
        buildMeshEdges(mesh, currentPolyface);
    }

    public addVertex(vertex: VertexKeyProps, addToMeshOnInsert = true): number {
        const onInsert = (vk: VertexKey) => this.mesh.addVertex(vk);
        return this.vertexMap.insertKey(vertex, addToMeshOnInsert ? onInsert : undefined);
    }

    public addTriangle(triangle: Triangle): void {
        if (triangle.isDegenerate) return;

        const onInsert = (_vk: TriangleKey) => {
            this.mesh.addTriangle(triangle);
        };
        this.triangleSet.insertKey(triangle, onInsert);
    }
}

export namespace MeshBuilder {
    // eslint-disable-line no-redeclare
    export interface Props extends Mesh.Props {
        tolerance: number;
        areaTolerance: number;
    }
    export interface PolyfaceOptions {
        includeParams: boolean;
        fillColor: number;
        mappedTexture?: TextureMapping;
        edgeOptions: MeshEdgeCreationOptions;
    }

    export interface PolyfaceVisitorOptions extends PolyfaceOptions {
        triangleCount: number;
        haveParam: boolean;
    }
}

export class MeshEdgeCreationOptions {
    public readonly type: MeshEdgeCreationOptions.Type;
    public readonly minCreaseAngle = 20.0 * Angle.radiansPerDegree;
    public get generateAllEdges(): boolean {
        return this.type === MeshEdgeCreationOptions.Type.AllEdges;
    }

    public get generateNoEdges(): boolean {
        return this.type === MeshEdgeCreationOptions.Type.NoEdges;
    }

    public get generateCreaseEdges(): boolean {
        return (this.type & MeshEdgeCreationOptions.Type.CreaseEdges) !== 0;
    }

    public get createEdgeChains(): boolean {
        return (this.type & MeshEdgeCreationOptions.Type.CreateChains) !== 0;
    }

    constructor(type = MeshEdgeCreationOptions.Type.NoEdges) {
        this.type = type;
    }
}

export namespace MeshEdgeCreationOptions {
    // eslint-disable-line no-redeclare
    export enum Type {
        NoEdges = 0x0000,
        CreaseEdges = 0x0001 << 1,
        SmoothEdges = 0x0001 << 2,
        CreateChains = 0x0001 << 3,
        DefaultEdges = CreaseEdges,
        AllEdges = CreaseEdges | SmoothEdges
    }
}

export class MeshBuilderPolyface {
    public readonly polyface: Polyface;
    public readonly edgeOptions: MeshEdgeCreationOptions;
    public readonly vertexIndexMap: Map<number, number> = new Map<number, number>();
    public readonly baseTriangleIndex: number;
    constructor(
        polyface: Polyface,
        edgeOptions: MeshEdgeCreationOptions,
        baseTriangleIndex: number
    ) {
        this.polyface = polyface;
        this.edgeOptions = edgeOptions;
        this.baseTriangleIndex = baseTriangleIndex;
    }
}

class EdgeInfo {
    public faceIndex1?: number;

    public constructor(
        public visible: boolean,
        public faceIndex0: number,
        public edge: MeshEdge,
        public point0: Point3d,
        public point1: Point3d
    ) {}

    public addFace(visible: boolean, faceIndex: number) {
        if (undefined === this.faceIndex1) {
            this.visible ||= visible;
            this.faceIndex1 = faceIndex;
        }
    }
}

function buildMeshEdges(mesh: Mesh, polyface: MeshBuilderPolyface): void {
    if (!mesh.triangles) return;

    const edgeMap = new Dictionary<MeshEdge, EdgeInfo>((lhs, rhs) => lhs.compareTo(rhs));
    const triangleNormals: Vector3d[] = [];

    const triangle = new Triangle();
    const polyfacePoints = [new Point3d(), new Point3d(), new Point3d()];
    const polyfaceIndices = [0, 0, 0];

    for (
        let triangleIndex = polyface.baseTriangleIndex;
        triangleIndex < mesh.triangles.length;
        triangleIndex++
    ) {
        let indexNotFound = false;
        mesh.triangles.getTriangle(triangleIndex, triangle);
        for (let j = 0; j < 3; j++) {
            const foundPolyfaceIndex = polyface.vertexIndexMap.get(triangle.indices[j]);
            assert(undefined !== foundPolyfaceIndex);
            if (undefined === foundPolyfaceIndex) {
                indexNotFound = true;
                continue;
            }

            polyfaceIndices[j] = foundPolyfaceIndex;
            polyface.polyface.data.getPoint(foundPolyfaceIndex, polyfacePoints[j]);
        }

        if (indexNotFound) continue;

        for (let j = 0; j < 3; j++) {
            const jNext = (j + 1) % 3;
            const triangleNormalIndex = triangleNormals.length;
            const meshEdge = new MeshEdge(triangle.indices[j], triangle.indices[jNext]);
            const polyfaceEdge = new MeshEdge(polyfaceIndices[j], polyfaceIndices[jNext]);
            const edgeInfo = new EdgeInfo(
                triangle.isEdgeVisible(j),
                triangleNormalIndex,
                meshEdge,
                polyfacePoints[j],
                polyfacePoints[jNext]
            );

            const findOrInsert = edgeMap.findOrInsert(polyfaceEdge, edgeInfo);
            if (!findOrInsert.inserted) {
                findOrInsert.value.addFace(edgeInfo.visible, triangleNormalIndex);
            }
        }

        const normal = Vector3d.createCrossProductToPoints(
            polyfacePoints[0],
            polyfacePoints[1],
            polyfacePoints[2]
        );
        normal.normalizeInPlace();
        triangleNormals.push(normal);
    }

    if (!polyface.edgeOptions.generateAllEdges) {
        const minEdgeDot = Math.cos(polyface.edgeOptions.minCreaseAngle);
        for (const edgeInfo of edgeMap.values()) {
            if (undefined !== edgeInfo.faceIndex1) {
                const normal0 = triangleNormals[edgeInfo.faceIndex0];
                const normal1 = triangleNormals[edgeInfo.faceIndex1];
                if (Math.abs(normal0.dotProduct(normal1)) > minEdgeDot) edgeInfo.visible = false;
            }
        }
    }

    if (undefined === mesh.edges) mesh.edges = new MeshEdges();

    const maxPlanarDot = 0.999999;
    for (const edgeInfo of edgeMap.values()) {
        if (edgeInfo.visible) {
            mesh.edges.visible.push(edgeInfo.edge);
        } else if (undefined !== edgeInfo.faceIndex1) {
            const normal0 = triangleNormals[edgeInfo.faceIndex0];
            const normal1 = triangleNormals[edgeInfo.faceIndex1];
            if (Math.abs(normal0.dotProduct(normal1)) < maxPlanarDot) {
                mesh.edges.silhouette.push(edgeInfo.edge);
                mesh.edges.silhouetteNormals.push(
                    new OctEncodedNormalPair(
                        OctEncodedNormal.fromVector(normal0),
                        OctEncodedNormal.fromVector(normal1)
                    )
                );
            }
        }
    }
}
