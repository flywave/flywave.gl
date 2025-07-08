import { BufferAttribute, BufferGeometry, Uint8BufferAttribute } from "three";

import { FeatureIndexType, QParams3d } from "../../common";
import { PointStringParams } from "../../common/render/primitives/point-string-params";
import { Point3d } from "../../core-geometry";
import { dispose } from "../../utils";
import { LUTGeometry } from "./cached-geometry";
import { RenderOrder } from "./render-flags";
import { VertexLUT } from "./vertex-lut";

export class PointStringGeometry extends LUTGeometry {
    public buffers: Record<string, BufferAttribute>;
    public readonly vertexParams: QParams3d;
    private readonly _hasFeatures: boolean;
    public readonly weight: number;
    public readonly lut: VertexLUT;
    public readonly indices: Uint8BufferAttribute;
    public readonly numIndices: number;

    public get lutBuffers() {
        return this.buffers;
    }

    private constructor(
        indices: Uint8BufferAttribute,
        numIndices: number,
        lut: VertexLUT,
        qparams: QParams3d,
        weight: number,
        hasFeatures: boolean,
        viOrigin: Point3d | undefined
    ) {
        super(viOrigin);
        this.buffers = {};

        this.buffers["a_pos"] = indices;

        this.numIndices = numIndices;
        this.indices = indices;
        this.lut = lut;
        this.vertexParams = qparams;
        this.weight = weight;
        this._hasFeatures = hasFeatures;
    }

    public override get hasFeatures() {
        return this._hasFeatures;
    }

    public get renderOrder(): RenderOrder {
        return RenderOrder.PlanarLinear;
    }

    public static create(
        params: PointStringParams,
        viOrigin: Point3d | undefined
    ): PointStringGeometry | undefined {
        const indices = new Uint8BufferAttribute(params.indices.data, 3);
        if (undefined === indices) return undefined;

        const lut = VertexLUT.createFromVertexTable(params.vertices);
        if (undefined === lut) return undefined;

        const hasFeatures = FeatureIndexType.Empty !== params.vertices.featureIndexType;
        return new PointStringGeometry(
            indices,
            params.indices.length,
            lut,
            params.vertices.qparams,
            params.weight,
            hasFeatures,
            viOrigin
        );
    }

    public override build(): BufferGeometry {
        return new BufferGeometry();
    }

    public dispose() {
        dispose(this.lut);
    }
}
