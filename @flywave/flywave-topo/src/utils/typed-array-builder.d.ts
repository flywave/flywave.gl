import { type Constructor } from "./utility-types";
/** Options used to construct a [[TypedArrayBuilder]].
 * @public
 */
export interface TypedArrayBuilderOptions {
    /** Controls how much additional memory is allocated when the TypedArray needs to be resized to accomodate more elements.
     * [[TypedArrayBuilder.ensureCapacity]] multiplies the required capacity by this factor to determine the new capacity.
     * Default: 1.5
     * Minimum: 1.0, which causes the TypedArray to allocate exactly the space it needs each time it is resized.
     */
    growthFactor?: number;
    /** The number of elements to allocate memory for in the TypedArray when creating the builder.
     * If you know the minimum number of elements you intend to add to the builder, you should specify that as the
     * initial capacity to avoid reallocations when populating the array.
     * Default: 0.
     * Minimum: 0.
     */
    initialCapacity?: number;
}
/** A [TypedArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray) containing unsigned 8-, 16-, or 32-bit integers.
 * @see [[UintArrayBuilder]] to construct such an array.
 * @public
 */
export type UintArray = Uint8Array | Uint16Array | Uint32Array;
/** Incrementally builds a [TypedArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray) of unsigned 8-, 16-, or 32-bit integers.
 * Sometimes you wish to populate a `TypedArray`, but you don't know how many elements you will need.
 * `TypedArray` requires you to specify the size upon construction, and does not permit you to change the size later.
 *
 * `TypedArrayBuilder` manages a `TypedArray`, permitting you to [[push]] and [[append]] elements to it. It exposes two "size" properties":
 *  - [[capacity]], the number of elements it has currently allocated space for - i.e., the length of the underlying TypedArray; and
 *  - [[length]], the number of elements that have so far been added to it, which is never bigger than [[capacity]].
 * When [[capacity]] is exceeded, a new, bigger TypedArray is allocated and the contents of the previous array are copied over to it.
 *
 * Once you've finished adding elements, you can obtain the finished `TypedArray` via [[toTypedArray]].
 * @see [[Uint8ArrayBuilder]], [[Uint16ArrayBuilder]], and [[Uint32ArrayBuilder]] to build specific types of arrays.
 * @see [[UintArrayBuilder]] when you don't know the maximum number of bytes required for each element in the array.
 * @public
 */
export declare class TypedArrayBuilder<T extends UintArray> {
    /** The constructor for the specific type of array being populated. */
    protected _constructor: Constructor<T>;
    /** The underlying typed array, to be reallocated and copied when its capacity is exceeded. */
    protected _data: T;
    /** The number of elements added to the array so far. */
    protected _length: number;
    /** Multiplier applied to required capacity by [[ensureCapacity]]. */
    readonly growthFactor: number;
    /** Constructs a new builder from the specified options, with a [[length]] of zero. */
    protected constructor(constructor: Constructor<T>, options?: TypedArrayBuilderOptions);
    /** The number of elements currently in the array. */
    get length(): number;
    /** The number of elements that can fit into the memory currently allocated for the array. */
    get capacity(): number;
    /** Like [TypedArray.at](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/at),
     * returns the element at the specified index, with negative integers counting back from the end of the array.
     * @note It is your responsibility to ensure the index falls within the bounds of the array.
     */
    at(index: number): number;
    /** Ensure that [[capacity]] is at least equal to `newCapacity`.
     * This is used internally by methods like [[push]] and [[append]] to ensure the array has room for the element(s) to be added.
     * It can also be useful when you know you intend to add some number of additional elements, to minimize reallocations.
     *
     * If `newCapacity` is not greater than the current [[capacity]], this function does nothing.
     * Otherwise, it allocates a new `TypedArray` with room for `newCapacity * growthFactor` elements, and copies the contents of the previous `TypedArray` into it.
     * [[length]] remains unchanged; [[capacity]] reflects the size of the new TypeArray.
     */
    ensureCapacity(newCapacity: number): number;
    /** Append the specified value, resizing if necessary. */
    push(value: number): void;
    /** Append an array of values, resizing (at most once) if necessary. */
    append(values: T): void;
    /** Obtain the finished array.
     * @param includeUnusedCapacity If true, the length of the returned array will be equal to [[capacity]], with extra bytes initialized to zero; otherwise, the
     * returned array's length will be equal to [[length]].
     */
    toTypedArray(includeUnusedCapacity?: boolean): T;
}
/** A [[TypedArrayBuilder]] for producing a [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array).
 * @public
 */
export declare class Uint8ArrayBuilder extends TypedArrayBuilder<Uint8Array> {
    /** See [[TypedArrayBuilder]] constructor. */
    constructor(options?: TypedArrayBuilderOptions);
}
/** A [[TypedArrayBuilder]] for producing a [Uint16Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint16Array).
 * @public
 */
export declare class Uint16ArrayBuilder extends TypedArrayBuilder<Uint16Array> {
    /** See [[TypedArrayBuilder]] constructor. */
    constructor(options?: TypedArrayBuilderOptions);
}
/** A [[TypedArrayBuilder]] for producing a [Uint32Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint32Array).
 * @public
 */
export declare class Uint32ArrayBuilder extends TypedArrayBuilder<Uint32Array> {
    /** See [[TypedArrayBuilder]] constructor. */
    constructor(options?: TypedArrayBuilderOptions);
    /** Obtain a view of the finished array as an array of bytes. */
    toUint8Array(includeUnusedCapacity?: boolean): Uint8Array;
}
/** Options used to construct a [[UintArrayBuilder]].
 * @public
 */
export interface UintArrayBuilderOptions extends TypedArrayBuilderOptions {
    /** The type of the initial empty `TypedArray` created by the builder. For example, if you know that you will be adding values larger than
     * 255 to the array, specify `{ initialType: Uint16Array }` to avoid replacing the otherwise default `Uint8Array` when the first such value is added.
     * Default: `Uint8Array`.
     */
    initialType?: typeof Uint8Array | typeof Uint16Array | typeof Uint32Array;
}
/** A [[TypedArrayBuilder]] that can populate a [[UintArray]] with the minimum
 * [bytes per element](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/BYTES_PER_ELEMENT) required.
 *
 * By default, the underlying array is a `Uint8Array`, though this can be configured via [[UintArrayBuilderOptions.initialType]].
 * As values are added to the array, if the bytes per element supported by the underlying array is too small to hold one of the new values, the array is
 * reallocated to a type large enough to hold all of the new values. For example, the following produces a `Uint8Array` because all values are less than 256:
 *
 * ```ts
 *  const builder = new UintArrayBuilder();
 *  builder.append([1, 2, 254, 255]);
 *  const array = builder.toTypedArray();
 *  assert(array instanceof Uint8Array);
 * ```
 *
 * However, the following produces a `Uint16Array` because one of the values is larger than 255 but none are larger than 65,535:
 *
 * ```ts
 *  const builder = new UintArrayBuilder();
 *  builder.append([1, 255, 257, 65535]);
 *  const array = builder.toTypedArray();
 *  assert(array instanceof Uint16Array);
 * ```
 *
 * @see [[Uint8ArrayBuilder]], [[Uint16ArrayBuilder]], or [[Uint32ArrayBuilder]] if you know the number of bytes you want to allocate for each element in the array.
 * @public
 */
export declare class UintArrayBuilder extends TypedArrayBuilder<UintArray> {
    constructor(options?: UintArrayBuilderOptions);
    /** The number of bytes (1, 2, or 4) currently allocated per element by the underlying array.
     * This may change as larger values are added to the array.
     */
    get bytesPerElement(): number;
    /** Ensures that the underlying array is of a type that can contain the largest value in `newValues`.
     * For example, if `_data` is a `Uint16Array` and `newValues` contains any value(s) larger than 65,535, it will be replaced with a `Uint32Array`.
     * This method is invoked by [[push]] and [[append]].
     */
    protected ensureBytesPerElement(newValues: Iterable<number>): void;
    /** See [[TypedArrayBuilder.push]]. */
    push(value: number): void;
    /** See [[TypedArrayBuilder.append]]. */
    append(values: UintArray): void;
}
