import { TypedArray } from "three";
import { arrayToString } from "./arrayToString";

export enum FeatureComponentType {
    BYTE = "BYTE",
    UNSIGNED_BYTE = "UNSIGNED_BYTE",
    SHORT = "SHORT",
    UNSIGNED_SHORT = "UNSIGNED_SHORT",
    INT = "INT",
    UNSIGNED_INT = "UNSIGNED_INT",
    FLOAT = "FLOAT",
    DOUBLE = "DOUBLE"
}

export enum FeatureType {
    SCALAR = "SCALAR",
    VEC2 = "VEC2",
    VEC3 = "VEC3",
    VEC4 = "VEC4"
}

export type FeatureValue = string | number | boolean | null | any[] | TypedArray;

export interface FeatureDescription {
    byteOffset?: number;
    type?: FeatureType;
    componentType?: FeatureComponentType;
    [key: string]: any;
}

export interface FeatureTableHeader {
    /**
     * 必填字段
     */
    BATCH_LENGTH?: number; // 当前 tileset 中的批处理要素数量

    /**
     * 几何相关字段
     */
    POSITION?: number[]; // 顶点位置 (Float32Array)
    POSITION_QUANTIZED?: number[]; // 量化顶点位置 (Uint16Array)
    RGBA?: number[]; // 顶点颜色 (Uint8Array, [R,G,B,A,...])
    RGB?: number[]; // 顶点颜色 (Uint8Array, [R,G,B,...])
    RGB565?: number[]; // 顶点颜色 (Uint16Array, RGB565格式)
    NORMAL?: number[]; // 顶点法线 (Float32Array)
    NORMAL_OCT16P?: number[]; // 八面体编码的法线 (Uint8Array)
    BATCH_ID?: number[]; // 批处理ID (Uint8Array, Uint16Array 或 Uint32Array)

    /**
     * 点云特定字段
     */
    POINTS_LENGTH?: number; // 点云中的点数

    INSTANCES_LENGTH?: number; // 实例数量
    RTC_CENTER?: number[]; // 相对中心坐标 (Float64Array, [x,y,z])
    QUANTIZED_VOLUME_OFFSET?: number[]; // 量化体积偏移
    QUANTIZED_VOLUME_SCALE?: number[]; // 量化体积比例
    EAST_NORTH_UP?: boolean; // 是否使用ENU坐标系

    extensions?: {
        [key: string]: any;
    };
    extras?: any;
    [propertyName: string]: any;
}

export interface BatchTableHeader {
    [propertyName: string]: number[] | string[] | boolean[] | any[];
}

export class FeatureTable<Header extends Object = FeatureTableHeader> {
    protected buffer: ArrayBuffer;
    protected binOffset: number;
    protected binLength: number;
    protected header: Header;

    constructor(buffer: ArrayBuffer, start: number, headerLength: number, binLength: number) {
        this.buffer = buffer;
        this.binOffset = start + headerLength;
        this.binLength = binLength;

        let header: Header;
        if (headerLength !== 0) {
            const headerData = new Uint8Array(buffer, start, headerLength);
            header = JSON.parse(arrayToString(headerData));
        } else {
            header = {} as Header;
        }
        this.header = header;
    }

    getKeys(): string[] {
        return Object.keys(this.header);
    }

    getData(
        key: string,
        count: number = 0,
        defaultComponentType: FeatureComponentType | null = null,
        defaultType: FeatureType | null = null
    ): FeatureValue {
        const header = this.header;

        if (!(key in header)) {
            return null;
        }

        const feature = header[key];
        if (!(feature instanceof Object) || Array.isArray(feature)) {
            return feature;
        }

        const { buffer, binOffset, binLength } = this;
        const byteOffset = (feature as FeatureDescription).byteOffset || 0;
        const featureType = (feature as FeatureDescription).type || defaultType;
        const featureComponentType =
            (feature as FeatureDescription).componentType || defaultComponentType;

        if ("type" in feature && defaultType && feature.type !== defaultType) {
            throw new Error("FeatureTable: Specified type does not match expected type.");
        }
        let stride: number;
        switch (featureType) {
            case FeatureType.SCALAR:
                stride = 1;
                break;
            case FeatureType.VEC2:
                stride = 2;
                break;
            case FeatureType.VEC3:
                stride = 3;
                break;
            case FeatureType.VEC4:
                stride = 4;
                break;
            default:
                throw new Error(`FeatureTable: Feature type not provided for "${key}".`);
        }

        let data: TypedArray;
        const arrayStart = binOffset + byteOffset;
        const arrayLength = count * stride;

        switch (featureComponentType) {
            case FeatureComponentType.BYTE:
                data = new Int8Array(buffer, arrayStart, arrayLength);
                break;
            case FeatureComponentType.UNSIGNED_BYTE:
                data = new Uint8Array(buffer, arrayStart, arrayLength);
                break;
            case FeatureComponentType.SHORT:
                data = new Int16Array(buffer, arrayStart, arrayLength);
                break;
            case FeatureComponentType.UNSIGNED_SHORT:
                data = new Uint16Array(buffer, arrayStart, arrayLength);
                break;
            case FeatureComponentType.INT:
                data = new Int32Array(buffer, arrayStart, arrayLength);
                break;
            case FeatureComponentType.UNSIGNED_INT:
                data = new Uint32Array(buffer, arrayStart, arrayLength);
                break;
            case FeatureComponentType.FLOAT:
                data = new Float32Array(buffer, arrayStart, arrayLength);
                break;
            case FeatureComponentType.DOUBLE:
                data = new Float64Array(buffer, arrayStart, arrayLength);
                break;
            default:
                throw new Error(`FeatureTable: Feature component type not provided for "${key}".`);
        }

        const dataEnd = arrayStart + arrayLength * data.BYTES_PER_ELEMENT;
        if (dataEnd > binOffset + binLength) {
            throw new Error("FeatureTable: Feature data read outside binary body length.");
        }

        return data;
    }
}

export class BatchTable<T extends BatchTableHeader = BatchTableHeader> extends FeatureTable<T> {
    private batchSize: number;

    constructor(
        buffer: ArrayBuffer,
        batchSize: number,
        start: number,
        headerLength: number,
        binLength: number
    ) {
        super(buffer, start, headerLength, binLength);
        this.batchSize = batchSize;
    }

    //@ts-ignore
    getData(
        key: string,
        componentType: FeatureComponentType | null = null,
        type: FeatureType | null = null
    ): ReturnType<FeatureTable["getData"]> {
        return super.getData(key, this.batchSize, componentType, type);
    }
}
