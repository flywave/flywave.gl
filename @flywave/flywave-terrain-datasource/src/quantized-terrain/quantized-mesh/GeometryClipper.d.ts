import { type Object3D, type Vector3, BufferGeometry, Matrix4, Mesh, Triangle } from "three";
export interface SplitOperation {
    callback: (geometry: BufferGeometry, i0: number, i1: number, i2: number, barycoord: Vector3, matrixWorld?: Matrix4) => number;
    keepPositive: boolean;
}
interface ClipValues {
    a: number;
    b: number;
    c: number;
}
interface Indices {
    a: number;
    b: number;
    c: number;
}
interface VertexData {
    indices: Indices;
    clipValues: ClipValues;
    barycoord: Triangle;
}
export interface ClippedData {
    index?: number[];
    vertexIsClipped?: boolean[];
    attributes?: Record<string, number[]>;
}
interface Range {
    start: number;
    count: number;
}
export declare class GeometryClipper {
    attributeList: string[] | ((key: string) => boolean) | null;
    splitOperations: SplitOperation[];
    trianglePool: ClipTrianglePool;
    constructor();
    protected forEachSplitPermutation(callback: () => void): void;
    protected addSplitOperation(callback: (geometry: BufferGeometry, i0: number, i1: number, i2: number, barycoord: Vector3, matrixWorld?: Matrix4) => number, keepPositive?: boolean): void;
    protected clearSplitOperations(): void;
    protected clipObject(object: Object3D): Object3D;
    clip(mesh: Mesh, range?: Range | null): Mesh;
    protected getClippedData(mesh: Mesh, range?: Range | null, target?: ClippedData): ClippedData;
    protected constructMesh(attributes: Record<string, number[]>, index: number[], sourceMesh: Mesh): Mesh;
    protected splitTriangle(tri: ClipTriangle, keepNegative: boolean, target: ClipTriangle[]): void;
}
declare class ClipTrianglePool {
    pool: ClipTriangle[];
    index: number;
    constructor();
    get(): ClipTriangle;
    reset(): void;
}
declare class ClipTriangle implements VertexData {
    indices: Indices;
    clipValues: ClipValues;
    barycoord: Triangle;
    constructor();
    getVertexHash(index: number, geometry: BufferGeometry): string | number;
    getVertexData(index: number, geometry: BufferGeometry, target: Record<string, number[]>): void;
    initFromTriangle(other: ClipTriangle): this;
    initFromIndices(i0: number, i1: number, i2: number): this;
    lerpVertexFromEdge(other: ClipTriangle, e0: string, e1: string, alpha: number, targetVertex: string): void;
    copyVertex(other: ClipTriangle, fromVertex: string, targetVertex: string): void;
}
export declare function hashVertex(...args: number[]): string;
export {};
