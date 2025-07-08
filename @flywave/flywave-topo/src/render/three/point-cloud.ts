import { BufferAttribute, BufferGeometry, Uint8BufferAttribute } from "three";

import { FeatureIndexType } from "../../common";
import { PointCloudArgs } from "../../primitives/point-cloud-primitive";
import { QBufferHandle3d } from "./attribute-buffers";
import { CachedGeometry } from "./cached-geometry";
import { RenderOrder } from "./render-flags";

export class PointCloudGeometry extends CachedGeometry {
    public readonly buffers: Record<string, BufferAttribute>;
    private readonly _vertices: QBufferHandle3d;
    private readonly _vertexCount: number;
    private readonly _colorHandle: Uint8BufferAttribute | undefined = undefined;
    private readonly _hasFeatures: boolean;

    public readonly voxelSize: number;
    public readonly colorIsBgr: boolean;

    public override get asPointCloud(): PointCloudGeometry | undefined {
        return this;
    }

    public override get supportsThematicDisplay() {
        return true;
    }

    public get overrideColorMix() {
        return 0.5;
    }

    public override build(): BufferGeometry {
        return new BufferGeometry();
    }

    public dispose() {}

    constructor(pointCloud: PointCloudArgs) {
        super();
        this.buffers = {};

        this._vertices = QBufferHandle3d.create(
            pointCloud.qparams,
            pointCloud.positions
        ) as QBufferHandle3d;

        this.buffers["a_pos"] = this._vertices;

        this._vertexCount = pointCloud.positions.length / 3;
        this._hasFeatures = FeatureIndexType.Empty !== pointCloud.features.type;
        this.voxelSize = pointCloud.voxelSize;
        this.colorIsBgr = pointCloud.colorFormat === "bgr";

        if (undefined !== pointCloud.colors) {
            this._colorHandle = new Uint8BufferAttribute(pointCloud.colors, 3);
            this.buffers["a_color"] = this._colorHandle;
        }
    }

    public get renderOrder(): RenderOrder {
        return RenderOrder.Linear;
    }

    public get qOrigin(): Float32Array {
        return this._vertices.origin;
    }

    public get qScale(): Float32Array {
        return this._vertices.scale;
    }

    public get colors(): Uint8BufferAttribute | undefined {
        return this._colorHandle;
    }

    public override get hasFeatures() {
        return this._hasFeatures;
    }

    public override get hasBakedLighting() {
        return true;
    }
}
