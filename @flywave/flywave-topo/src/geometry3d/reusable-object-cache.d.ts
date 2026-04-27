import { GrowableXYZArray } from "./growable-xyz-array";
import { type IndexedXYZCollection } from "./indexed-xyz-collection";
/**
 * abstract class managing an array of objects of type T, available for reuse by trusted callers.
 * * Derived class must implement these methods:
 *   * `createForCache()` -- create a new, ready-to-use object
 *   * `clearForCache (data: T)` -- tidy up `data` so it can be reused.
 * @internal
 */
export declare abstract class ReusableObjectCache<T> {
    protected abstract clearForCache(data: T): void;
    protected abstract createForCache(): T;
    private readonly _cachedObjects;
    numDrop: number;
    numCreate: number;
    numReuse: number;
    /**
     * create a new cache for objects of type T
     */
    protected constructor();
    /** Present `data` for storage in the cache, and hence reuse by any subsequent `grabFromCache`
     *   * `data` will be sent to `clearForCache`.
     *   * caller should never refer to this instance again.
     */
    dropToCache(data: T | undefined): void;
    /**
     * grab an object from the cache.
     *  * The returned object becomes property of the caller.
     *  * That is, the cache does not remember it for any further management
     * @param data
     */
    grabFromCache(): T;
    /** Drop all entries of data[] to the cache.
     * @param data on input, the data to drop. on output, data is an empty array.
     */
    dropAllToCache(data: T[]): void;
}
/**
 * Cache of GrowableXYZArray.
 * Intended for use by (for instance) clipping methods that can be structured to have disciplined reuse of a small number of arrays for a large number of steps.
 * @internal
 */
export declare class GrowableXYZArrayCache extends ReusableObjectCache<GrowableXYZArray> {
    protected clearForCache(data: GrowableXYZArray): void;
    protected createForCache(): GrowableXYZArray;
    constructor();
    /**
     * Grab an array from the cache and immediately fill from a source
     * @param source
     */
    grabAndFill(source: IndexedXYZCollection): GrowableXYZArray;
}
