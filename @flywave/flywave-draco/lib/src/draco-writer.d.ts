import type { DracoBuildOptions } from "./lib/draco-builder";
import type { DracoMesh } from "./lib/draco-types";
export interface DracoWriterOptions {
    draco?: DracoBuildOptions & {
        method?: "MESH_EDGEBREAKER_ENCODING" | "MESH_SEQUENTIAL_ENCODING";
        speed?: [number, number];
        quantization?: Record<string, number>;
        attributeNameEntry?: string;
    };
}
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
//# sourceMappingURL=draco-writer.d.ts.map