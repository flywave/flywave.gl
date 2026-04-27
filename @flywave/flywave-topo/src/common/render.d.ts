import { type OctEncodedNormalPair } from "./oct-encoded-normal";
/** Describes the semantics of a [PolylineArgs]($frontend).
 * @alpha
 */
export declare enum PolylineTypeFlags {
    Normal = 0,// Just an ordinary polyline
    Edge = 1,// A polyline used to define the edges of a planar region.
    Outline = 2
}
/** Flags describing a [PolylineArgs]($frontend).
 * @public
 */
export interface PolylineFlags {
    /** If `true`, the polylines are to be drawn as individual disconnected point strings instead of as connected line strings. */
    isDisjoint?: boolean;
    /** If `true`, the polylines' positions are all coplanar. */
    isPlanar?: boolean;
    /** If `true`, the polylines' positions all have the same z coordinate. */
    is2d?: boolean;
    /** Default: Normal.
     * @alpha
     */
    type?: PolylineTypeFlags;
}
/** Describes the vertex indices of a single line within a [PolylineArgs]($frontend).
 * The indices represent either a line string as a connected series of points, or a point string as a set of disconnected points, depending
 * on the [[PolylineFlags.isDisjoint]] value of [PolylineArgs.flags]($frontend).
 * @public
 */
export type PolylineIndices = number[];
/** @internal */
export declare class MeshPolyline {
    readonly indices: PolylineIndices;
    constructor(indices?: PolylineIndices);
    addIndex(index: number): void;
    clear(): void;
}
/** @internal */
export declare class MeshPolylineList extends Array<MeshPolyline> {
    constructor(...args: MeshPolyline[]);
}
/** @internal */
export declare class MeshEdge {
    indices: number[];
    constructor(index0?: number, index1?: number);
    compareTo(other: MeshEdge): number;
}
/** @internal */
export declare class MeshEdges {
    visible: MeshEdge[];
    silhouette: MeshEdge[];
    polylines: MeshPolylineList;
    silhouetteNormals: OctEncodedNormalPair[];
    constructor();
}
/** @internal */
export declare class EdgeArgs {
    edges?: MeshEdge[];
    init(meshEdges?: MeshEdges): boolean;
    clear(): void;
    get isValid(): boolean;
    get numEdges(): number;
}
/** @internal */
export declare class SilhouetteEdgeArgs extends EdgeArgs {
    normals?: OctEncodedNormalPair[];
    init(meshEdges?: MeshEdges): boolean;
    clear(): void;
}
/** @internal */
export declare class PolylineEdgeArgs {
    lines?: PolylineIndices[];
    constructor(lines?: PolylineIndices[]);
    init(lines?: PolylineIndices[]): boolean;
    get numLines(): number;
    get isValid(): boolean;
    clear(): void;
}
