/* Copyright (C) 2025 flywave.gl contributors */



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
export function isIDisposable(obj: unknown): obj is IDisposable {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return (
        !!obj &&
        obj instanceof Object &&
        !!(obj as IDisposable).dispose &&
        typeof (obj as IDisposable).dispose === "function"
    );
}

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
export function dispose(disposable?: IDisposable): undefined {
    if (undefined !== disposable) disposable.dispose();
    return undefined;
}

/** Disposes of and empties a list of disposable objects.
 * @param list The list of disposable objects.
 * @returns undefined
 * @public
 */
export function disposeArray(list?: IDisposable[]): undefined {
    if (undefined === list) return undefined;

    for (const entry of list) dispose(entry);

    list.length = 0;
    return undefined;
}

/** A 'using' function which is a substitution for .NET's using statement. It makes sure that 'dispose'
 * is called on the resource no matter if the func returns or throws. If func returns, the return value
 * of this function is equal to return value of func. If func throws, this function also throws (after
 * disposing the resource).
 * @public
 */
export function using<T extends IDisposable, TResult>(
    resources: T | T[],
    func: (...r: T[]) => TResult
): TResult {
    if (!Array.isArray(resources)) return using([resources], func);

    const doDispose = () => {
        resources.forEach(disposable => {
            disposable.dispose();
        });
    };
    let shouldDisposeImmediately = true;

    try {
        const result = func(...resources);
        if (result instanceof Promise) {
            shouldDisposeImmediately = false;
            result.then(doDispose, doDispose);
        }
        return result;
    } finally {
        if (shouldDisposeImmediately) doDispose();
    }
}

/** A definition of function which may be called to dispose an object
 * @public
 */
export type DisposeFunc = () => void;

class FuncDisposable implements IDisposable {
    private readonly _disposeFunc: () => void;
    constructor(disposeFunc: () => void) {
        this._disposeFunc = disposeFunc;
    }

    public dispose() {
        this._disposeFunc();
    }
}

/** A disposable container of disposable objects.
 * @public
 */
export class DisposableList implements IDisposable {
    private readonly _disposables: IDisposable[];

    /** Creates a disposable list. */
    constructor(disposables: Array<IDisposable | DisposeFunc> = []) {
        this._disposables = [];
        disposables.forEach(disposable => {
            this.add(disposable);
        });
    }

    private isDisposable(x: IDisposable | DisposeFunc): x is IDisposable {
        return (x as IDisposable).dispose !== undefined;
    }

    /** Register an object for disposal. */
    public add(disposable: IDisposable | DisposeFunc) {
        if (this.isDisposable(disposable)) this._disposables.push(disposable);
        else this._disposables.push(new FuncDisposable(disposable));
    }

    /** Unregister disposable object. */
    public remove(disposable: IDisposable): void {
        const idx = this._disposables.indexOf(disposable);
        if (idx !== -1) this._disposables.splice(idx, 1);
    }

    /** Disposes all registered objects. */
    public dispose(): void {
        for (const disposable of this._disposables) disposable.dispose();
    }
}
