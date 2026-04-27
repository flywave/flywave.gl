import { type TextureMapping } from "../../common";
import { type DisplayParams } from "../../common/render/primitives/display-params";
import { type IndexedPolyface, type Polyface, type PolyfaceVisitor, type Range3d, Point3d } from "../../core-geometry";
import { Triangle, TriangleSet } from "../primitives";
import { type StrokesPrimitivePointLists } from "../strokes";
import { type VertexKeyProps, VertexMap } from "../vertex-key";
import { Mesh } from "./mesh-primitives";
type VertexKeyPropsWithIndex = VertexKeyProps & {
    sourceIndex: number;
};
export declare class MeshBuilder {
    readonly vertexMap: VertexMap;
    private _triangleSet?;
    private _currentPolyface?;
    readonly mesh: Mesh;
    readonly tolerance: number;
    readonly areaTolerance: number;
    readonly tileRange: Range3d;
    get currentPolyface(): MeshBuilderPolyface | undefined;
    get displayParams(): DisplayParams;
    set displayParams(params: DisplayParams);
    get triangleSet(): TriangleSet;
    private constructor();
    static create(props: MeshBuilder.Props): MeshBuilder;
    addStrokePointLists(strokes: StrokesPrimitivePointLists, isDisjoint: boolean, fillColor: number): void;
    addFromPolyface(polyface: IndexedPolyface, props: MeshBuilder.PolyfaceOptions): void;
    addFromPolyfaceVisitor(visitor: PolyfaceVisitor, options: MeshBuilder.PolyfaceOptions): void;
    createTriangleVertices(triangleIndex: number, visitor: PolyfaceVisitor, options: MeshBuilder.PolyfaceVisitorOptions): VertexKeyPropsWithIndex[] | undefined;
    createTriangle(triangleIndex: number, visitor: PolyfaceVisitor, options: MeshBuilder.PolyfaceVisitorOptions): Triangle | undefined;
    addPolyline(points: Point3d[], fillColor: number): void;
    addPointString(points: Point3d[], fillColor: number): void;
    beginPolyface(polyface: Polyface, options: MeshEdgeCreationOptions): void;
    endPolyface(): void;
    addVertex(vertex: VertexKeyProps, addToMeshOnInsert?: boolean): number;
    addTriangle(triangle: Triangle): void;
}
export declare namespace MeshBuilder {
    interface Props extends Mesh.Props {
        tolerance: number;
        areaTolerance: number;
    }
    interface PolyfaceOptions {
        includeParams: boolean;
        fillColor: number;
        mappedTexture?: TextureMapping;
        edgeOptions: MeshEdgeCreationOptions;
    }
    interface PolyfaceVisitorOptions extends PolyfaceOptions {
        triangleCount: number;
        haveParam: boolean;
    }
}
export declare class MeshEdgeCreationOptions {
    readonly type: MeshEdgeCreationOptions.Type;
    readonly minCreaseAngle: number;
    get generateAllEdges(): boolean;
    get generateNoEdges(): boolean;
    get generateCreaseEdges(): boolean;
    get createEdgeChains(): boolean;
    constructor(type?: MeshEdgeCreationOptions.Type);
}
export declare namespace MeshEdgeCreationOptions {
    enum Type {
        NoEdges = 0,
        CreaseEdges = 2,
        SmoothEdges = 4,
        CreateChains = 8,
        DefaultEdges = 2,
        AllEdges = 6
    }
}
export declare class MeshBuilderPolyface {
    readonly polyface: Polyface;
    readonly edgeOptions: MeshEdgeCreationOptions;
    readonly vertexIndexMap: Map<number, number>;
    readonly baseTriangleIndex: number;
    constructor(polyface: Polyface, edgeOptions: MeshEdgeCreationOptions, baseTriangleIndex: number);
}
export {};
