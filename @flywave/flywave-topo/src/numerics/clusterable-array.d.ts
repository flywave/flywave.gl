import { GrowableBlockedArray } from "../geometry3d/growable-blocked-array";
import { GrowableXYArray } from "../geometry3d/growable-xy-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d } from "../geometry3d/point3d-vector3d";
/**
 * Blocked array with operations to sort and cluster with a tolerance.
 * * Primary sorting is along an "arbitrary" sort vector.
 * @internal
 */
export declare class ClusterableArray extends GrowableBlockedArray {
    private static readonly _vectorFactor;
    /** Return a component of the sort vector. */
    static sortVectorComponent(index: number): number;
    private readonly _numCoordinatePerPoint;
    private readonly _numExtraDataPerPoint;
    /**
     * @param numCoordinatePerPoint number of coordinates per point
     * @param  numExtraDataPerPoint of extra data values per point.
     * @param initialBlockCapacity predicted number of points.  (This does not have to be accurate)
     */
    constructor(numCoordinatePerPoint: number, numExtraDataPerPoint: number, initialBlockCapacity: number);
    /** load a block, placing data[i] at block[i+1] to allow sort coordinate first.
     * @param data array of numDataPerBlock values.
     */
    addBlock(data: number[]): void;
    /** add a block directly with 1 to 5 listed content parameters.
     * This assumes numDataPerPoint is sufficient for the parameters provided.
     */
    addDirect(x0: number, x1?: number, x2?: number, x3?: number, x4?: number): void;
    /** add a block directly from a Point2d with 0 to 3 extras
     * This assumes numDataPerPoint is sufficient for the parameters provided.
     */
    addPoint2d(xy: Point2d, a?: number, b?: number, c?: number): void;
    /** add a block with directly from a Point2d with 0 to 3 extras
     * This assumes numDataPerPoint is sufficient for the parameters provided.
     */
    addPoint3d(xyz: Point3d, a?: number, b?: number, c?: number): void;
    /** Get the xy coordinates by point index. */
    getPoint2d(blockIndex: number, result?: Point2d): Point2d;
    /** Get the xyZ coordinates by point index. */
    getPoint3d(blockIndex: number, result?: Point3d): Point3d;
    /** Return a single extra data value */
    getExtraData(blockIndex: number, i: number): number;
    /** Return a single data value */
    getData(blockIndex: number, i: number): number;
    /** Set a single extra data value */
    setExtraData(blockIndex: number, i: number, value: number): void;
    /** this value is used as cluster terminator in the Uint232Array of indices. */
    static readonly clusterTerminator = 4294967295;
    /** Test if `x` is the cluster terminator value. */
    static isClusterTerminator(x: number): boolean;
    /** Return an array giving clusters of blocks with similar coordinates.
     *
     * * The contents of each block is assumed to be set up so the primary sort coordinate is first.
     *
     * ** simple coordinate blocks (x,y) or (x,y,z) would work fine but have occasional performance problems because points with same x would generate big blocks of
     * candidates for clusters.
     * ** The usual solution is to sort by u value, which is a dot product along some skew direction, and have the blocks contain (u,x,y) or (u,x,y,z) for 2d versus 3d.
     * ** apply setupPrimaryClusterSort to prepare that!!!
     * * After a simple lexical sort, consecutive blocks that are within tolerance in the 0 component
     * are inspected.  Within that candidate set, all blocks that are within tolerance for ALL components are clustered.
     * * In the output cluster array, clusters are terminated a invalid index. Test for the invalid index with GrowableBlockArray.isClusterTerminator (x)
     */
    clusterIndicesLexical(clusterTolerance?: number): Uint32Array;
    /** setup (overwrite!!) the "0" component with the dot product of numClusterCoordinate later components with a non-axis aligned vector.
     * This is normally called before clusterIndicesLexical.
     */
    setupPrimaryClusterSort(): void;
    /** Convert the cluster data to an array of tuples with point i in the form
     * `[i, primarySortCoordinate, [x,y,..], [extraData0, extraData1, ...]]`
     */
    toJSON(): any[];
    /**
     * Return an array of indices from block index to cluster index.
     * @param clusteredBlocks clusters of block indices followed by separators.
     */
    createIndexBlockToClusterIndex(clusteredBlocks: Uint32Array): Uint32Array;
    /**
     * Return an array of indices from block index to index of its cluster's start in the cluster index array.
     * @param clusteredBlocks clusters of block indices followed by separators.
     */
    createIndexBlockToClusterStart(clusteredBlocks: Uint32Array): Uint32Array;
    /** count the clusters in the clusteredBlocks array. */
    countClusters(clusteredBlocks: Uint32Array): number;
    /** create a reverse index: given a cluster index k, clusterToClusterStart[k] is the place
     * the cluster's block indices appear in clusterBlocks
     */
    createIndexClusterToClusterStart(clusteredBlocks: Uint32Array): Uint32Array;
    /**
     * Sort terminator-delimited subsets of an array of indices into the table, using a single data value as sort key.
     * @param blockedIndices indices, organized as blocks of good indices terminated by the clusterTerminator. Each block is individually sorted on return.
     * @param dataIndex index of the data key, e.g., if the sort key is the first extraData (angle) after x and y coordinate data, pass dataIndex = 2.
     */
    sortSubsetsBySingleKey(blockedIndices: Uint32Array, dataIndex: number): void;
    /**
     * Returns packed points with indices mapping old to new.
     * @param data points to cluster.
     */
    static clusterPoint3dArray(data: Point3d[], tolerance?: number): PackedPointsWithIndex;
    /**
     * Returns number array with indices mapping old to new.
     * @param data numbers to cluster.
     */
    static clusterNumberArray(data: number[], tolerance?: number): PackedNumbersWithIndex;
    /**
     * Returns packed points with indices mapping old to new.
     * @param data points to cluster.
     */
    static clusterGrowablePoint2dArray(source: GrowableXYArray, tolerance?: number): PackedPoint2dsWithIndex;
    /**
     * Returns packed points with indices mapping old to new.
     * @param data points to cluster.
     */
    static clusterGrowablePoint3dArray(source: GrowableXYZArray, tolerance?: number): PackedPointsWithIndex;
}
/**
 * Data carrier class for
 * * packedPoints = an array of Point3d
 * * oldToNew = array of indices from some prior Point3d[] to the packed points.
 * @internal
 */
declare class PackedPointsWithIndex {
    /** Array of Point3d */
    packedPoints: Point3d[];
    /** array of coordinates packed in GrowableXYZArray  */
    growablePackedPoints: GrowableXYZArray | undefined;
    /** mapping from old point index to new point index. */
    oldToNew: Uint32Array;
    /** integer value for unknown index. */
    static readonly invalidIndex = 4294967295;
    /** construct a PackedPoints object with
     * * empty packedPoints array
     * * oldToNew indices all initialized to PackedPoints.invalidIndex
     */
    constructor(numOldIndexEntry: number);
    /**
     * Use the oldToNew array to update an array of "old" indices.
     * @param indices array of indices into prepacked array.
     * @returns true if all input indices were valid for the oldToNew array.
     */
    updateIndices(indices: number[]): boolean;
}
/**
 * @internal
 */
declare class PackedPoint2dsWithIndex {
    /** array of coordinates packed in GrowableXYArray  */
    growablePackedPoints: GrowableXYArray;
    /** mapping from old point index to new point index. */
    oldToNew: Uint32Array;
    /** integer value for unknown index. */
    static readonly invalidIndex = 4294967295;
    /** construct a PackedPoints object with
     * * empty packedPoints array
     * * oldToNew indices all initialized to PackedPoints.invalidIndex
     */
    constructor(numOldIndexEntry: number, numPackedPoints: number);
    /**
     * Use the oldToNew array to update an array of "old" indices.
     * @param indices array of indices into prepacked array.
     * @returns true if all input indices were valid for the oldToNew array.
     */
    updateIndices(indices: number[]): boolean;
}
/**
 * @internal
 */
declare class PackedNumbersWithIndex {
    /** Array of numbers */
    packedNumbers: number[];
    /** mapping from old point index to new point index. */
    oldToNew: Uint32Array;
    /** integer value for unknown index. */
    static readonly invalidIndex = 4294967295;
    /** construct a PackedNumbers object with
     * * empty packedNumbers array
     * * oldToNew indices all initialized to PackedNumbers.invalidIndex
     */
    constructor(numOldIndexEntry: number);
    /**
     * Use the oldToNew array to update an array of "old" indices.
     * @param indices array of indices into prepacked array.
     * @returns true if all input indices were valid for the oldToNew array.
     */
    updateIndices(indices: number[]): boolean;
}
export {};
