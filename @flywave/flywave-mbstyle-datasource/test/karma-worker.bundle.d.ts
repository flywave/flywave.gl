export = BufferWriter;
export = BufferWriter;
declare function BufferWriter(): void;
declare class BufferWriter {
    override bytes(value: any): this;
    override string(value: any): this;
}
declare namespace BufferWriter {
    export { _configure, writeFloatLE, writeFloatBE, readFloatLE, readFloatBE, writeDoubleLE, writeDoubleBE, readDoubleLE, readDoubleBE, parseCSSColor, earcut as default, __esModule };
}
declare function _configure(): void;
declare const writeFloatLE: any;
declare const writeFloatBE: any;
declare const readFloatLE: any;
declare const readFloatBE: any;
declare const writeDoubleLE: any;
declare const writeDoubleBE: any;
declare const readDoubleLE: any;
declare const readDoubleBE: any;
declare function parseCSSColor(css_str: any): any;
declare function earcut(data: any, holeIndices: any, dim: any): any[];
declare namespace earcut {
    function deviation(data: any, holeIndices: any, dim: any, triangles: any): number;
    function flatten(data: any): {
        vertices: any[];
        holes: any[];
        dimensions: any;
    };
}
declare const __esModule: boolean;
//# sourceMappingURL=karma-worker.bundle.d.ts.map