/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

import { type QParams2d, type QParams3d } from "../common";
import {
    type AuxChannel,
    type AuxChannelTable,
    type AuxDisplacementChannel,
    type AuxParamChannel
} from "../common/render/primitives/aux-channel-table";
import { type VertexTable } from "../common/render/primitives/vertex-table";
import { type IDisposable, dispose } from "../utils";
import { qorigin3dToArray, qparams2dToArray, qscale3dToArray } from "./attribute-buffers";
import { ColorInfo } from "./color-info";

type ChannelPropName = "normals" | "displacements" | "params";

export class AuxChannelLUT implements IDisposable {
    public readonly texture: THREE.Texture;
    public readonly numVertices: number;
    public readonly numBytesPerVertex: number;
    public displacements?: Map<string, AuxDisplacementChannel>;
    public normals?: Map<string, AuxChannel>;
    public params?: Map<string, AuxParamChannel>;

    private constructor(texture: THREE.Texture, table: AuxChannelTable) {
        this.texture = texture;
        this.numVertices = table.numVertices;
        this.numBytesPerVertex = table.numBytesPerVertex;
        this.initChannels<AuxDisplacementChannel>(table, "displacements");
        this.initChannels<AuxChannel>(table, "normals");
        this.initChannels<AuxParamChannel>(table, "params");
    }

    private initChannels<T extends AuxChannel>(
        table: AuxChannelTable,
        name: ChannelPropName
    ): void {
        const channels = table[name];
        if (undefined === channels) return;

        const map = new Map<string, T>();

        this[name] = map as any;
        for (const channel of channels) map.set(channel.name, channel as T);
    }

    public get hasScalarAnimation() {
        return undefined !== this.params;
    }

    public dispose() {
        dispose(this.texture);
    }

    public static create(table: AuxChannelTable): AuxChannelLUT | undefined {
        const texture = new THREE.DataTexture(table.data, table.width, table.height);
        return undefined !== texture ? new AuxChannelLUT(texture, table) : undefined;
    }
}

export class VertexLUT implements IDisposable {
    public readonly texture: THREE.Texture;
    public readonly numVertices: number;
    public readonly numRgbaPerVertex: number;
    public readonly colorInfo: ColorInfo;
    public readonly usesQuantizedPositions: boolean;
    public readonly qOrigin: Float32Array;
    public readonly qScale: Float32Array;
    public readonly uvQParams?: Float32Array;
    public readonly auxChannels?: AuxChannelLUT;

    public get hasAnimation() {
        return undefined !== this.auxChannels;
    }

    public get hasScalarAnimation() {
        return undefined !== this.auxChannels && this.auxChannels.hasScalarAnimation;
    }

    public static createFromVertexTable(
        vt: VertexTable,
        aux?: AuxChannelTable
    ): VertexLUT | undefined {
        const texture = new THREE.DataTexture(vt.data, vt.width, vt.height);
        if (undefined === texture) return undefined;

        const auxLUT = undefined !== aux ? AuxChannelLUT.create(aux) : undefined;
        return new VertexLUT(
            texture,
            vt,
            ColorInfo.createFromVertexTable(vt),
            vt.qparams,
            !vt.usesUnquantizedPositions,
            vt.uvParams,
            auxLUT
        );
    }

    private constructor(
        texture: THREE.Texture,
        table: VertexTable,
        colorInfo: ColorInfo,
        qparams: QParams3d,
        positionsAreQuantized: boolean,
        uvParams?: QParams2d,
        auxChannels?: AuxChannelLUT
    ) {
        this.texture = texture;
        this.numVertices = table.numVertices;
        this.numRgbaPerVertex = table.numRgbaPerVertex;
        this.colorInfo = colorInfo;
        this.qOrigin = qorigin3dToArray(qparams.origin);
        this.qScale = qscale3dToArray(qparams.scale);
        this.usesQuantizedPositions = positionsAreQuantized;
        this.auxChannels = auxChannels;
        if (undefined !== uvParams) this.uvQParams = qparams2dToArray(uvParams);
    }

    public dispose() {
        dispose(this.texture);
    }
}
