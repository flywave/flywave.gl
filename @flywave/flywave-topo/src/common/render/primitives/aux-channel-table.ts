/* Copyright (C) 2025 flywave.gl contributors */



import { OctEncodedNormal, QParams3d, QPoint3d, Quantization } from "../../../common";
import {
    type AuxChannel as PolyfaceAuxChannel,
    AuxChannelDataType,
    Point3d,
    Range1d,
    Range3d,
    Vector3d
} from "../../../core-geometry";
import { type Mutable, assert } from "../../../utils";
import { computeDimensions } from "./vertex-table";

export interface AuxChannelProps {
    readonly name: string;
    readonly inputs: number[];
    readonly indices: number[];
}

export interface QuantizedAuxChannelProps extends AuxChannelProps {
    readonly qOrigin: number[];
    readonly qScale: number[];
}

export class AuxChannel implements AuxChannelProps {
    public readonly name: string;
    public readonly inputs: number[];
    public readonly indices: number[];

    public constructor(props: AuxChannelProps) {
        this.name = props.name;
        this.inputs = props.inputs;
        this.indices = props.indices;
    }

    public toJSON(): AuxChannelProps {
        return {
            name: this.name,
            inputs: this.inputs,
            indices: this.indices
        };
    }
}

export class AuxDisplacementChannel extends AuxChannel {
    public readonly qOrigin: Float32Array;
    public readonly qScale: Float32Array;

    public constructor(props: QuantizedAuxChannelProps) {
        super(props);
        this.qOrigin = Float32Array.from(props.qOrigin);
        this.qScale = Float32Array.from(props.qScale);
    }

    public override toJSON(): QuantizedAuxChannelProps {
        return {
            ...super.toJSON(),
            qOrigin: Array.from(this.qOrigin),
            qScale: Array.from(this.qScale)
        };
    }
}

export class AuxParamChannel extends AuxChannel {
    public readonly qOrigin: number;
    public readonly qScale: number;

    public constructor(props: QuantizedAuxChannelProps) {
        super(props);
        this.qOrigin = props.qOrigin[0];
        this.qScale = props.qScale[0];
    }

    public override toJSON(): QuantizedAuxChannelProps {
        return {
            ...super.toJSON(),
            qOrigin: [this.qOrigin],
            qScale: [this.qScale]
        };
    }
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

export class AuxChannelTable {
    public readonly data: Uint8Array;
    public readonly width: number;
    public readonly height: number;
    public readonly numVertices: number;
    public readonly numBytesPerVertex: number;
    public readonly displacements?: AuxDisplacementChannel[];
    public readonly normals?: AuxChannel[];
    public readonly params?: AuxParamChannel[];

    private constructor(
        props: AuxChannelTableProps,
        displacements?: AuxDisplacementChannel[],
        normals?: AuxChannel[],
        params?: AuxParamChannel[]
    ) {
        this.data = props.data;
        this.width = props.width;
        this.height = props.height;
        this.numVertices = props.count;
        this.numBytesPerVertex = props.numBytesPerVertex;
        this.displacements = displacements;
        this.normals = normals;
        this.params = params;
    }

    public static fromJSON(props: AuxChannelTableProps): AuxChannelTable | undefined {
        let displacements: AuxDisplacementChannel[] | undefined;
        let normals: AuxChannel[] | undefined;
        let params: AuxParamChannel[] | undefined;

        if (undefined !== props.displacements && props.displacements.length > 0) {
            displacements = [];
            for (const displacement of props.displacements) {
                displacements.push(new AuxDisplacementChannel(displacement));
            }
        }

        if (undefined !== props.normals && props.normals.length > 0) {
            normals = [];
            for (const normal of props.normals) normals.push(new AuxChannel(normal));
        }

        if (undefined !== props.params && props.params.length > 0) {
            params = [];
            for (const param of props.params) params.push(new AuxParamChannel(param));
        }

        return undefined !== displacements || undefined !== normals || undefined !== params
            ? new AuxChannelTable(props, displacements, normals, params)
            : undefined;
    }

    public toJSON(): AuxChannelTableProps {
        return {
            data: this.data,
            width: this.width,
            height: this.height,
            count: this.numVertices,
            numBytesPerVertex: this.numBytesPerVertex,
            displacements: this.displacements?.map(x => x.toJSON()),
            normals: this.normals?.map(x => x.toJSON()),
            params: this.params?.map(x => x.toJSON())
        };
    }

    public static fromChannels(
        channels: readonly PolyfaceAuxChannel[],
        numVertices: number,
        maxDimension: number
    ): AuxChannelTable | undefined {
        return AuxChannelTableBuilder.buildAuxChannelTable(channels, numVertices, maxDimension);
    }
}

function invert(num: number): number {
    if (num !== 0) num = 1 / num;

    return num;
}

class AuxChannelTableBuilder {
    private readonly _view: DataView;
    private readonly _props: Mutable<AuxChannelTableProps>;
    private readonly _numBytesPerVertex: number;

    private constructor(props: Mutable<AuxChannelTableProps>, numBytesPerVertex: number) {
        this._props = props;
        this._numBytesPerVertex = numBytesPerVertex;
        this._view = new DataView(props.data.buffer);
    }

    public static buildAuxChannelTable(
        channels: readonly PolyfaceAuxChannel[],
        numVertices: number,
        maxDimension: number
    ): AuxChannelTable | undefined {
        const numBytesPerVertex = channels.reduce(
            (accum, channel) => accum + computeNumBytesPerVertex(channel),
            0
        );
        if (!numBytesPerVertex) return undefined;

        const nRgbaPerVertex = Math.floor((numBytesPerVertex + 3) / 4);
        const nUnusedBytesPerVertex = nRgbaPerVertex * 4 - numBytesPerVertex;
        assert(nUnusedBytesPerVertex === 0 || nUnusedBytesPerVertex === 2);

        let dimensions;
        if (nUnusedBytesPerVertex !== 0) {
            dimensions = computeDimensions(
                Math.floor((numVertices + 1) / 2),
                numBytesPerVertex / 2,
                0,
                maxDimension
            );
        } // twice as many RGBA for half as many vertices.
        else dimensions = computeDimensions(numVertices, nRgbaPerVertex, 0, maxDimension);

        const data = new Uint8Array(dimensions.width * dimensions.height * 4);
        const props: Mutable<AuxChannelTableProps> = {
            data,
            width: dimensions.width,
            height: dimensions.height,
            count: numVertices,
            numBytesPerVertex
        };

        const builder = new AuxChannelTableBuilder(props, numBytesPerVertex);
        builder.build(channels);
        return AuxChannelTable.fromJSON(props);
    }

    private build(channels: readonly PolyfaceAuxChannel[]): void {
        let byteOffset = 0;
        for (const channel of channels) {
            if (AuxChannelDataType.Normal === channel.dataType) {
                this.addNormals(channel, byteOffset);
            } else if (AuxChannelDataType.Vector === channel.dataType) {
                this.addDisplacements(channel, byteOffset);
            } else this.addParams(channel, byteOffset);

            byteOffset += computeNumBytesPerVertex(channel);
        }
    }

    private addNormals(channel: PolyfaceAuxChannel, byteOffset: number): void {
        const inputs = [];
        const indices = [];

        const normal = new Vector3d();
        for (let i = 0; i < channel.data.length; i++) {
            let byteIndex = byteOffset + i * 2; // 2 bytes per normal
            indices.push(byteIndex / 2); // indices aligned to 2-byte intervals

            const data = channel.data[i];
            inputs.push(data.input);

            for (let j = 0; j < data.values.length; j += 3) {
                normal.x = data.values[j];
                normal.y = data.values[j + 1];
                normal.z = data.values[j + 2];
                normal.normalizeInPlace();

                const encodedNormal = OctEncodedNormal.encode(normal);
                this._view.setUint16(byteIndex, encodedNormal, true);
                byteIndex += this._numBytesPerVertex;
            }
        }

        const normals = this._props.normals ?? (this._props.normals = []);
        normals.push({
            name: channel.name ?? "",
            inputs,
            indices
        });
    }

    private addParams(channel: PolyfaceAuxChannel, byteOffset: number): void {
        const inputs = [];
        const indices = [];

        const range = Range1d.createNull();
        for (const data of channel.data) {
            inputs.push(data.input);
            range.extendArray(data.values);
        }

        const qScale = Quantization.computeScale(range.high - range.low);

        for (let i = 0; i < channel.data.length; i++) {
            let byteIndex = byteOffset + i * 2; // 2 bytes per double
            indices.push(byteIndex / 2); // indices aligned to 2-byte intervals

            for (const value of channel.data[i].values) {
                const quantized = Quantization.quantize(value, range.low, qScale);
                this._view.setUint16(byteIndex, quantized, true);
                byteIndex += this._numBytesPerVertex;
            }
        }

        const params = this._props.params ?? (this._props.params = []);
        params.push({
            inputs,
            indices,
            name: channel.name ?? "",
            qOrigin: [range.low],
            qScale: [invert(qScale)]
        });
    }

    private addDisplacements(channel: PolyfaceAuxChannel, byteOffset: number): void {
        const inputs = [];
        const indices = [];

        const point = new Point3d();
        const range = Range3d.createNull();
        for (const data of channel.data) {
            inputs.push(data.input);
            for (let i = 0; i < data.values.length; i += 3) {
                point.set(data.values[i], data.values[i + 1], data.values[i + 2]);
                range.extend(point);
            }
        }

        const qParams = QParams3d.fromRange(range);
        const qPoint = new QPoint3d();
        for (let i = 0; i < channel.data.length; i++) {
            let byteIndex = byteOffset + i * 6; // 2 bytes per coordinate
            indices.push(byteIndex / 2); // indices aligned to 2-byte intervals

            const data = channel.data[i];
            for (let j = 0; j < data.values.length; j += 3) {
                point.set(data.values[j], data.values[j + 1], data.values[j + 2]);
                qPoint.init(point, qParams);

                this._view.setUint16(byteIndex + 0, qPoint.x, true);
                this._view.setUint16(byteIndex + 2, qPoint.y, true);
                this._view.setUint16(byteIndex + 4, qPoint.z, true);
                byteIndex += this._numBytesPerVertex;
            }
        }

        const displacements = this._props.displacements ?? (this._props.displacements = []);
        displacements.push({
            inputs,
            indices,
            name: channel.name ?? "",
            qOrigin: qParams.origin.toArray(),
            qScale: qParams.scale.toArray().map(x => invert(x))
        });
    }
}

function computeNumBytesPerVertex(channel: PolyfaceAuxChannel): number {
    const nEntries = channel.data.length;
    switch (channel.dataType) {
        case AuxChannelDataType.Vector:
            return 6 * nEntries; // 3 16-bit quantized coordinate values per entry.
        case AuxChannelDataType.Normal:
        case AuxChannelDataType.Distance:
        case AuxChannelDataType.Scalar:
            return 2 * nEntries; // 1 16-bit quantized value per entry.
    }
}
