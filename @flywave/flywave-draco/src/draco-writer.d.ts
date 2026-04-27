import type { DracoBuildOptions } from "./loader/draco-builder";
import type { DracoMesh } from "./loader/draco-types";
/** Writer Options for draco */
export interface DracoWriterOptions {
    draco?: DracoBuildOptions & {
        method?: "MESH_EDGEBREAKER_ENCODING" | "MESH_SEQUENTIAL_ENCODING";
        speed?: [number, number];
        quantization?: Record<string, number>;
        attributeNameEntry?: string;
    };
}
/**
 * Browser worker doesn't work because of issue during "draco_encoder.js" loading.
 * Refused to execute script from 'https://raw.githubusercontent.com/google/draco/1.4.1/javascript/draco_encoder.js' because its MIME type ('') is not executable.
 */
export declare const DracoWriterWorker: {
    id: string;
    name: string;
    module: string;
    version: any;
    worker: boolean;
    options: {
        draco: {};
        source: any;
    };
};
/**
 * Exporter for Draco3D compressed geometries
 */
export declare const DracoWriter: {
    readonly name: "DRACO";
    readonly id: "draco";
    readonly module: "draco";
    readonly version: any;
    readonly extensions: readonly ["drc"];
    readonly mimeTypes: readonly ["application/octet-stream"];
    readonly options: {
        readonly draco: {
            pointcloud: boolean;
            attributeNameEntry: string;
        };
    };
    readonly encode: typeof encode;
};
declare function encode(data: DracoMesh, options?: DracoWriterOptions): Promise<ArrayBuffer>;
export {};
