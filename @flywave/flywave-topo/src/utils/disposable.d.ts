export interface IDisposable {
    /** Disposes of any resources owned by this object.
     * @note The object is generally considered unusable after it has been disposed of.
     */
    dispose(): void;
}
/**
 * A type guard that checks whether the given argument implements `IDisposable` interface
 * @public
 */
export declare function isIDisposable(obj: unknown): obj is IDisposable;
/** Convenience function for disposing of a disposable object that may be undefined.
 * This is primarily used to simplify implementations of [[IDisposable.dispose]].
 * As a simple example:
 * ```ts
 *  class Disposable implements IDisposable {
 *    public member1?: DisposableType1;
 *    public member2?: DisposableType2;
 *
 *    public dispose() {
 *      this.member1 = dispose(this.member1); // If member1 is defined, dispose of it and set it to undefined.
 *      this.member2 = dispose(this.member2); // Likewise for member2.
 *    }
 *  }
 * ```
 * @param disposable The object to be disposed of.
 * @returns undefined
 * @public
 */
export declare function dispose(disposable?: IDisposable): undefined;
/** Disposes of and empties a list of disposable objects.
 * @param list The list of disposable objects.
 * @returns undefined
 * @public
 */
export declare function disposeArray(list?: IDisposable[]): undefined;
/** A 'using' function which is a substitution for .NET's using statement. It makes sure that 'dispose'
 * is called on the resource no matter if the func returns or throws. If func returns, the return value
 * of this function is equal to return value of func. If func throws, this function also throws (after
 * disposing the resource).
 * @public
 */
export declare function using<T extends IDisposable, TResult>(resources: T | T[], func: (...r: T[]) => TResult): TResult;
/** A definition of function which may be called to dispose an object
 * @public
 */
export type DisposeFunc = () => void;
/** A disposable container of disposable objects.
 * @public
 */
export declare class DisposableList implements IDisposable {
    private readonly _disposables;
    /** Creates a disposable list. */
    constructor(disposables?: Array<IDisposable | DisposeFunc>);
    private isDisposable;
    /** Register an object for disposal. */
    add(disposable: IDisposable | DisposeFunc): void;
    /** Unregister disposable object. */
    remove(disposable: IDisposable): void;
    /** Disposes all registered objects. */
    dispose(): void;
}
