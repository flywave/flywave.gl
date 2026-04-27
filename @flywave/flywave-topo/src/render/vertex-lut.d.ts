import * as THREE from "three";
import { type AuxChannel, type AuxChannelTable, type AuxDisplacementChannel, type AuxParamChannel } from "../common/render/primitives/aux-channel-table";
import { type VertexTable } from "../common/render/primitives/vertex-table";
import { type IDisposable } from "../utils";
import { ColorInfo } from "./color-info";
export declare class AuxChannelLUT implements IDisposable {
    readonly texture: THREE.Texture;
    readonly numVertices: number;
    readonly numBytesPerVertex: number;
    displacements?: Map<string, AuxDisplacementChannel>;
    normals?: Map<string, AuxChannel>;
    params?: Map<string, AuxParamChannel>;
    private constructor();
    private initChannels;
    get hasScalarAnimation(): boolean;
    dispose(): void;
    static create(table: AuxChannelTable): AuxChannelLUT | undefined;
}
export declare class VertexLUT implements IDisposable {
    readonly texture: THREE.Texture;
    readonly numVertices: number;
    readonly numRgbaPerVertex: number;
    readonly colorInfo: ColorInfo;
    readonly usesQuantizedPositions: boolean;
    readonly qOrigin: Float32Array;
    readonly qScale: Float32Array;
    readonly uvQParams?: Float32Array;
    readonly auxChannels?: AuxChannelLUT;
    get hasAnimation(): boolean;
    get hasScalarAnimation(): boolean;
    static createFromVertexTable(vt: VertexTable, aux?: AuxChannelTable): VertexLUT | undefined;
    private constructor();
    dispose(): void;
}
