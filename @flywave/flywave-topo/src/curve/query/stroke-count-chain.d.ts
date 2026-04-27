import { type Range1d } from "../../geometry3d/range";
import { type CurveCollection, CurveChain } from "../curve-collection";
import { type AnyCurve } from "../curve-types";
import { LineString3d } from "../line-string3d";
import { type StrokeOptions } from "../stroke-options";
import { StrokeCountMap } from "./stroke-count-map";
/**
 * abstract methods for callbacks during sweeps of collections of StrokeCount Structures.
 * * A set of StrokeCountMaps are to be visited multiple times.
 * * The logic that controls the sweep is as below.
 * * The callback object controls the number of sweeps and can adapt its action to the respective sweeps.
 * * Note that a "false" from cb.startPass() terminates passes for this chainIndex and primitiveIndex, but all others exit the whole sequence.
 * * This logic occurs 2 or three levels deep
 *   * outer level is "chains".   Simple swept path or loops have only one outer; parity regions have one outer per loop of the parity region
 *   * second level is primitive within chain.
 *     * If the primitives in a set are "single component", second level is lowest.
 *        * startSweep() and endSweep() calls are two parameters, with undefined componentIndex
 *     * If the primitives in a set are multi-component, there is a third level looping through corresponding components.
 * `
 *    if (!cb.startSweeps (chainIndex, primitiveIndex, componentIndex))
 *      return false;
 *    for (let pass = 0;cb.startPass (pass); pass++){
 *      for (each map in working set)
 *            if (!cb.visit (pass, map)) return false;
 *       if (!cb.endPass ()) return false;
 *        }
 *      }
 * if (!cb.endSweeps (chainIndex, primitiveIndex, componentIndex)) return false;
 * return true;
 * `
 * @internal
 */
export declare abstract class StrokeCountMapMultipassVisitor {
    /**
     * called to announce the beginning of one or more sweeps through related StrokeCountMap's
     * @param chainIndex index of loop or path within the various contours.
     * @param primitiveIndex index of primitive within the loop or path.
     * @param componentIndex optional component index.
     * @returns the number of sweeps to perform.
     */
    startSweeps(_chainIndex: number, _primitiveIndex: number, _componentIndex?: number): boolean;
    /**
     * announce the beginning of a sweep pass.
     * @param pass the index (0,1...) for this sweep pass.
     * @return true to execute this pass.  false to break from the pass loop (next method called is endSweeps)
     */
    abstract startPass(pass: number): boolean;
    abstract visit(pass: number, map: StrokeCountMap): boolean;
    /**
     * announce the end of a pass
     * @param pass the index (0,1...) for this sweep pass.
     * @return true to continue the sweeps.
     */
    abstract endPass(pass: number): boolean;
    /**
     * announce the end of handling for particular chainIndex and primitiveIndex;
     * @return true to continue outer loops.
     */
    endSweeps(_chainIndex: number, _primitiveIndex: number, _componentIndex?: number): boolean;
}
/**
 * * pass 1: determine max numStroke
 * * pass 2: impose max numStroke
 * @internal
 */
export declare class StrokeCountMapVisitorApplyMaxCount extends StrokeCountMapMultipassVisitor {
    myMap: StrokeCountMap;
    constructor();
    /** set up for a pass through corresponding maps. */
    startPass(pass: number): boolean;
    /** visit one of the set of corresponding maps. */
    visit(pass: number, map: StrokeCountMap): boolean;
    endPass(_pass: number): boolean;
}
/**
 * * pass 1: determine max curveLength among maps presented.
 * * pass 2: set the a0 and a1 values to 0 and that max distance
 * @internal
 */
export declare class StrokeCountMapVisitorApplyMaxCurveLength extends StrokeCountMapMultipassVisitor {
    maxCurveLength: number;
    constructor();
    /** set up for a pass through corresponding maps. */
    startPass(pass: number): boolean;
    /** visit one of the set of corresponding maps. */
    visit(pass: number, map: StrokeCountMap): boolean;
    endPass(_pass: number): boolean;
}
/**
 * class `StrokeCountChain` contains:
 * * `maps` = an array of `StrokeCountMap`
 * * `parent` = parent CurveCollection.
 *
 * An instance is normally created with either a `Path` or `Loop` as the parent.
 */
export declare class StrokeCountChain {
    maps: StrokeCountMap[];
    parent?: CurveCollection;
    /**
     * options are used (with different purposes) at two times:
     * * When the StrokeCountChain is created, the options affect the stroke counts.  This is just creating markup, not actual strokes.
     * * When actual stroking happens, the options control creation of parameters and tangents.
     */
    options?: StrokeOptions;
    private constructor();
    static createForCurveChain(chain: CurveChain, options?: StrokeOptions): StrokeCountChain;
    getStrokes(): LineString3d;
    /** internal form of  */
    private static applySummed01LimitsWithinArray;
    /**
     * walk the maps in the array.
     * * in maps with no component data
     *   * increment map.a0 and map.a1 by the incoming distance a0
     * * in maps with component data:
     *   * recurse through the component array.
     *   * increment map.a0 by the incoming a0.
     *   * returned a1 from the componentData array becomes a1
     * @returns upper value of a1 in final map.
     * @param maps
     * @param incomingSum lower value to add to a0 for first map.
     */
    applySummed01Limits(incomingSum: number): number;
}
/**
 * class `StrokeCountSection`\
 * * contains an array of `StrokeCountChain`.
 * * Hence it is the internal node level of a (1-level-deep) tree of `StrokeCountChain`
 * @internal
 */
export declare class StrokeCountSection {
    chains: StrokeCountChain[];
    parent?: CurveCollection;
    private constructor();
    /**
     * construct array of arrays of `StrokeCountMap`s
     * @param parent
     */
    static createForParityRegionOrChain(parent: CurveCollection, options?: StrokeOptions): StrokeCountSection;
    /** test if all sections have the same structure. */
    static areSectionsCompatible(sections: StrokeCountSection[], enforceCounts: boolean): boolean;
    /** Within each section, sweep accumulate curveLength field, recording entry and exit sum in each map.
     * * In expected use, (a0,a1) are (0,a) where a is the (previously computed) max length among corresponding maps up and down the section arrays.
     */
    static remapa0a1WithinEachChain(sections: StrokeCountSection[]): void;
    private static applyMultipassVisitorCallbackNoComponents;
    /**
     * Walk through the sections, emitting callbacks delimiting groups of corresponding primitives.
     * @param sections array of sections (possibly a single path or loop at each section, or possibly a set of parity loops.)
     * @param callback object to be notified during the traversal
     */
    static runMultiPassVisitorAtCorrespondingPrimitives(sections: StrokeCountSection[], callback: StrokeCountMapMultipassVisitor): boolean;
    /**
     * * Confirm that all sections in the array have the same structure.
     * * Within each corresponding set of entries, apply the max count to all.
     * @param sections array of per-section stroke count entries
     */
    static enforceStrokeCountCompatibility(sections: StrokeCountSection[]): boolean;
    /**
     * * Confirm that all sections in the array have the same structure.
     * * Within each corresponding set of entries up and down the sections, set curveLength as the maximum of the respective curve lengths.
     * * Along each section, sum curveLengths (which were just reset) to get consistent along-chain parameters
     * @param sections array of per-section stroke count entries
     */
    static enforceCompatibleDistanceSums(sections: StrokeCountSection[]): boolean;
    /**
     * Return stroked form of the section.
     */
    getStrokes(): AnyCurve;
    /**
     * Given two compatible stroke sets (as returned by getStrokes) extend a range
     * with the distances between corresponding points.
     * * Each set of strokes may be:
     *   * linestring
     *   * ParityRegion
     *   * CurveChain (Loop or Path)
     * @param strokeA first set of strokes
     * @param strokeB second set of strokes
     * @param rangeToExtend caller-allocated range to be extended.
     * @returns true if structures are compatible.
     */
    static extendDistanceRangeBetweenStrokes(strokeA: AnyCurve, strokeB: AnyCurve, rangeToExtend: Range1d): boolean;
}
