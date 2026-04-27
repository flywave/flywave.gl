/**
 * Methods to "grab and drop" mask bits.
 * * Caller code (e.g. HalfEdgeGraph) initializes with a block of bits to be managed.
 * * Callers borrow and return masks with "grabMask" and "dropMask"
 * * Callers must exercise grab/drop balance discipline.
 * @internal
 */
export declare class MaskManager {
    private _freeMasks;
    private readonly _originalFreeMasks;
    private readonly _firstFreeMask;
    /**
     * @param freeMasks caller-defined block of bits that are to be managed.
     */
    private constructor();
    /** Create a MaskManager.
     * Typical use:   MaskManager.create (0xFFFF0000)
     * * This makes bits 16 through 31 available to be borrowed, with lower bits available for fixed usage.
     */
    static create(freeMasks: number): MaskManager | undefined;
    /**
     * Find a mask bit that is not "in use".
     */
    grabMask(): number;
    /**
     * Find a mask bit that is not "in use".
     */
    dropMask(mask: number): void;
}
