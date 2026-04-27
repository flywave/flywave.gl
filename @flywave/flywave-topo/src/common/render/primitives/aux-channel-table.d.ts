import { type AuxChannel as PolyfaceAuxChannel } from "../../../core-geometry";
export interface AuxChannelProps {
    readonly name: string;
    readonly inputs: number[];
    readonly indices: number[];
}
export interface QuantizedAuxChannelProps extends AuxChannelProps {
    readonly qOrigin: number[];
    readonly qScale: number[];
}
export declare class AuxChannel implements AuxChannelProps {
    readonly name: string;
    readonly inputs: number[];
    readonly indices: number[];
    constructor(props: AuxChannelProps);
    toJSON(): AuxChannelProps;
}
export declare class AuxDisplacementChannel extends AuxChannel {
    readonly qOrigin: Float32Array;
    readonly qScale: Float32Array;
    constructor(props: QuantizedAuxChannelProps);
    toJSON(): QuantizedAuxChannelProps;
}
export declare class AuxParamChannel extends AuxChannel {
    readonly qOrigin: number;
    readonly qScale: number;
    constructor(props: QuantizedAuxChannelProps);
    toJSON(): QuantizedAuxChannelProps;
}
export interface AuxChannelTableProps {
    readonly data: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly count: number;
    readonly numBytesPerVertex: number;
    readonly displacements?: QuantizedAuxChannelProps[];
    readonly normals?: AuxChannelProps[];
    readonly params?: QuantizedAuxChannelProps[];
}
export declare class AuxChannelTable {
    readonly data: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly numVertices: number;
    readonly numBytesPerVertex: number;
    readonly displacements?: AuxDisplacementChannel[];
    readonly normals?: AuxChannel[];
    readonly params?: AuxParamChannel[];
    private constructor();
    static fromJSON(props: AuxChannelTableProps): AuxChannelTable | undefined;
    toJSON(): AuxChannelTableProps;
    static fromChannels(channels: readonly PolyfaceAuxChannel[], numVertices: number, maxDimension: number): AuxChannelTable | undefined;
}
