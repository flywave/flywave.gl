import { type IndexedPolyface } from "./polyface";
export declare class FacetOrientationFixup {
    private readonly _edges;
    private readonly _edgeToPartnerEdge;
    private readonly _edgeToEdgeInComponent;
    private _facetToFirstEdgeInComponent;
    private _facetOrientation;
    private readonly _components;
    private readonly _visitor;
    private readonly _mesh;
    private constructor();
    private edgeIdToFacetOrientation;
    /**
     * RETURN FALSE IF ANY EDGE HAS 3 ORE MORE FACETS
     */
    private setupUnoriented;
    private recordFacetInComponent;
    private initializeComponent;
    private readonly _workArray;
    private pushFacetEdgesOnStack;
    /**
     * * Run flood search from every possible seed, assigning positive and negative orientations
     * * Halt and return false if flood detects Klein bottle effects.
     * @return true if flood
     */
    private doFlood;
    private doFacetReversals;
    static doFixup(mesh: IndexedPolyface): boolean;
    /** swap entries at indices in a number array.
     * * indices are not checked for validity.
     */
    private static swapEntries;
    /**
     *
     * @param data an array of cyclically linked loops.
     */
    private static extractCyclicIndices;
}
