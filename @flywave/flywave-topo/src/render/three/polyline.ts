import { BufferGeometry } from "three";

import { FeatureIndexType, PolylineTypeFlags, QParams3d } from "../../common";
import { PolylineParams } from "../../common/render/primitives/polyline-params";
import { Point3d } from "../../core-geometry";
import { dispose } from "../../utils";
import { LUTGeometry, PolylineBuffers } from "./cached-geometry";
import { LineCode } from "./line-code";
import { RenderOrder } from "./render-flags";
import { VertexLUT } from "./vertex-lut";

export class PolylineGeometry extends LUTGeometry {
    public vertexParams: QParams3d;
    private readonly _hasFeatures: boolean;
    public lineWeight: number;
    public lineCode: number;
    public type: PolylineTypeFlags;
    private readonly _isPlanar: boolean;
    public lut: VertexLUT;
    public numIndices: number;
    private readonly _buffers: PolylineBuffers;

    public get lutBuffers() {
        return this._buffers.buffers;
    }

    private constructor(
        lut: VertexLUT,
        buffers: PolylineBuffers,
        params: PolylineParams,
        viOrigin: Point3d | undefined
    ) {
        super(viOrigin);
        this.vertexParams = params.vertices.qparams;
        this._hasFeatures = FeatureIndexType.Empty !== params.vertices.featureIndexType;
        this.lineWeight = params.weight;
        this.lineCode = LineCode.valueFromLinePixels(params.linePixels);
        this.type = params.type;
        this._isPlanar = params.isPlanar;
        this.lut = lut;
        this.numIndices = params.polyline.indices.length;
        this._buffers = buffers;
    }

    public dispose() {
        dispose(this.lut);
        dispose(this._buffers);
    }

    public get isAnyEdge(): boolean {
        return PolylineTypeFlags.Normal !== this.type;
    }

    public get isNormalEdge(): boolean {
        return PolylineTypeFlags.Edge === this.type;
    }

    public get isOutlineEdge(): boolean {
        return PolylineTypeFlags.Outline === this.type;
    }

    public get renderOrder(): RenderOrder {
        if (this.isAnyEdge) return this.isPlanar ? RenderOrder.PlanarEdge : RenderOrder.Edge;
        else return this.isPlanar ? RenderOrder.PlanarLinear : RenderOrder.Linear;
    }

    public override get polylineBuffers(): PolylineBuffers | undefined {
        return this._buffers;
    }

    public get isPlanar(): boolean {
        return this._isPlanar;
    }

    public override get isEdge(): boolean {
        return this.isAnyEdge;
    }

    public override get qOrigin(): Float32Array {
        return this.lut.qOrigin;
    }

    public override get qScale(): Float32Array {
        return this.lut.qScale;
    }

    public get numRgbaPerVertex(): number {
        return this.lut.numRgbaPerVertex;
    }

    public override get hasFeatures() {
        return this._hasFeatures;
    }

    public override build(): BufferGeometry {
        return new BufferGeometry();
    }

    public static create(
        params: PolylineParams,
        viewIndependentOrigin: Point3d | undefined
    ): PolylineGeometry | undefined {
        const lut = VertexLUT.createFromVertexTable(params.vertices);
        if (undefined === lut) return undefined;

        const buffers = PolylineBuffers.create(params.polyline);
        if (undefined === buffers) return undefined;

        return new PolylineGeometry(lut, buffers, params, viewIndependentOrigin);
    }
}
