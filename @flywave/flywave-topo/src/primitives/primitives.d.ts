import { type GraphicBuilder } from "../render/graphic-builder";
import { SortedArray } from "../utils";
export declare namespace ToleranceRatio {
    const vertex = 0.1;
    const facetArea = 0.1;
}
export declare enum NormalMode {
    Never = 0,
    Always = 1,
    CurvedSurfacesOnly = 2
}
export declare enum SurfacesOnly {
    Yes = 1,
    No = 0
}
export declare enum PreserveOrder {
    Yes = 1,
    No = 0
}
export declare enum GenerateEdges {
    Yes = 1,
    No = 0
}
export declare class GeometryOptions {
    readonly normals: NormalMode;
    readonly surfaces: SurfacesOnly;
    readonly preserveOrder: PreserveOrder;
    readonly edges: GenerateEdges;
    constructor(edges: GenerateEdges, normals?: NormalMode, surfaces?: SurfacesOnly, preserveOrder?: PreserveOrder);
    get wantSurfacesOnly(): boolean;
    get wantPreserveOrder(): boolean;
    get wantEdges(): boolean;
    static createForGraphicBuilder(params: GraphicBuilder, normals?: NormalMode, surfaces?: SurfacesOnly): GeometryOptions;
}
export declare class Triangle {
    readonly indices: Uint32Array<ArrayBuffer>;
    readonly visible: boolean[];
    singleSided: boolean;
    constructor(singleSided?: boolean);
    setIndices(a: number, b: number, c: number): void;
    setEdgeVisibility(a: boolean, b: boolean, c: boolean): void;
    isEdgeVisible(index: number): boolean;
    get isDegenerate(): boolean;
}
export declare class TriangleList {
    private readonly _flags;
    readonly indices: number[];
    get length(): number;
    get isEmpty(): boolean;
    addTriangle(triangle: Triangle): void;
    addFromTypedArray(indices: Uint8Array | Uint16Array | Uint32Array, flags?: number): void;
    getTriangle(index: number, out?: Triangle): Triangle;
}
export declare class TriangleKey {
    private readonly _sortedIndices;
    constructor(triangle: Triangle);
    compare(rhs: TriangleKey): number;
}
export declare class TriangleSet extends SortedArray<TriangleKey> {
    constructor();
    insertKey(triangle: Triangle, onInsert: (triangleKey: TriangleKey) => any): number;
}
