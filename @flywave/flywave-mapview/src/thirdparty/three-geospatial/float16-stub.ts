function halfToFloat(bits: number): number {
    const sign = (bits >> 15) & 1;
    const exp = (bits >> 10) & 0x1f;
    const mant = bits & 0x3ff;
    if (exp === 0) {
        return (sign ? -1 : 1) * Math.pow(2, -14) * (mant / 1024);
    } else if (exp === 31) {
        return mant ? NaN : sign ? -Infinity : Infinity;
    }
    return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

function floatToHalf(value: number): number {
    const floatView = new Float32Array(1);
    const intView = new Uint32Array(floatView.buffer);
    floatView[0] = value;
    const bits = intView[0];
    const sign = (bits >> 31) & 1;
    let exp = (bits >> 23) & 0xff;
    let mant = bits & 0x7fffff;
    if (exp === 0) {
        return (sign << 15) | (0 << 10) | 0;
    } else if (exp === 255) {
        if (mant === 0) return (sign << 15) | (31 << 10) | 0;
        return (sign << 15) | (31 << 10) | (mant >> 13);
    }
    const newExp = exp - 127 + 15;
    if (newExp >= 31) {
        return (sign << 15) | (31 << 10) | 0;
    }
    if (newExp <= 0) {
        return (sign << 15) | (0 << 10) | ((mant | 0x800000) >> (1 - newExp + 13));
    }
    return (sign << 15) | (newExp << 10) | (mant >> 13);
}

export class Float16Array {
    [index: number]: number;
    private _data: Uint16Array;

    static get BYTES_PER_ELEMENT(): number {
        return 2;
    }

    constructor(input?: number | ArrayBufferLike | ArrayLike<number> | Iterable<number>) {
        if (typeof input === "number") {
            this._data = new Uint16Array(input);
        } else if (input instanceof ArrayBuffer || input instanceof SharedArrayBuffer) {
            this._data = new Uint16Array(input);
        } else if (input != null && (input as any).length !== undefined) {
            const arr: number[] = Array.from(input as any) as number[];
            this._data = new Uint16Array(arr.length);
            for (let i = 0; i < arr.length; i++) {
                this._data[i] = floatToHalf(arr[i]);
            }
        } else {
            this._data = new Uint16Array();
        }
        return new Proxy(this, {
            get(target, prop) {
                if (typeof prop === "string" && !isNaN(Number(prop))) {
                    return halfToFloat(target._data[Number(prop)]);
                }
                if (prop === "buffer") return target._data.buffer;
                if (prop === "byteOffset") return target._data.byteOffset;
                if (prop === "byteLength") return target._data.byteLength;
                if (prop === "length") return target._data.length;
                if (prop === "BYTES_PER_ELEMENT") return 2;
                if (prop === Symbol.iterator) return target._data[Symbol.iterator];
                return (target as any)[prop];
            },
            set(target, prop, value) {
                if (typeof prop === "string" && !isNaN(Number(prop))) {
                    target._data[Number(prop)] = floatToHalf(value);
                    return true;
                }
                (target as any)[prop] = value;
                return true;
            }
        }) as any;
    }

    get buffer(): ArrayBufferLike {
        return this._data.buffer;
    }
    get byteOffset(): number {
        return this._data.byteOffset;
    }
    get byteLength(): number {
        return this._data.byteLength;
    }
    get length(): number {
        return this._data.length;
    }
}

export type Float16ArrayConstructor = typeof Float16Array;
export { Float16Array as default };
