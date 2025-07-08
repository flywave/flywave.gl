import {
    BufferAttribute,
    BufferGeometry,
    InterleavedBuffer,
    InterleavedBufferAttribute,
    Uint8BufferAttribute,
    Uint32BufferAttribute
} from "three";

import { QParams3d, QPoint3dList } from "../../common";
import { TesselatedPolyline } from "../../common/render/primitives/polyline-params";
import { Point3d, Range3d } from "../../core-geometry";
import { dispose, IDisposable } from "../../utils";
import { QBufferHandle3d } from "./attribute-buffers";
import { ColorInfo } from "./color-info";
import { EdgeGeometry, SilhouetteEdgeGeometry } from "./edge-geometry";
import { IndexedEdgeGeometry } from "./indexed-edge-geometry";
import { InstancedGeometry } from "./instanced-geometry";
import { MaterialInfo } from "./material";
import { MeshGeometry } from "./mesh-geometry";
import { PlanarGridGeometry } from "./planar-grid";
import { PointCloudGeometry } from "./point-cloud";
import { RenderOrder } from "./render-flags";
import { SurfaceGeometry } from "./surface-geometry";
import { Target } from "./target";
import { VertexLUT } from "./vertex-lut";

export abstract class CachedGeometry implements IDisposable {
    protected _range?: Range3d;

    public get asLUT(): LUTGeometry | undefined {
        return undefined;
    }

    public get asSurface(): SurfaceGeometry | undefined {
        return undefined;
    }

    public get asMesh(): MeshGeometry | undefined {
        return undefined;
    }

    public get asEdge(): EdgeGeometry | undefined {
        return undefined;
    }

    public get asIndexedEdge(): IndexedEdgeGeometry | undefined {
        return undefined;
    }

    public get asSilhouette(): SilhouetteEdgeGeometry | undefined {
        return undefined;
    }

    public get asInstanced(): InstancedGeometry | undefined {
        return undefined;
    }

    public get isInstanced() {
        return undefined !== this.asInstanced;
    }

    public get asPointCloud(): PointCloudGeometry | undefined {
        return undefined;
    }

    public get asPlanarGrid(): PlanarGridGeometry | undefined {
        return undefined;
    }

    public get alwaysRenderTranslucent(): boolean {
        return false;
    }

    public get allowColorOverride(): boolean {
        return true;
    }

    public abstract get renderOrder(): RenderOrder;
    public get isLitSurface(): boolean {
        return false;
    }

    public get hasBakedLighting(): boolean {
        return false;
    }

    public get hasAnimation(): boolean {
        return false;
    }

    public get usesQuantizedPositions(): boolean {
        return true;
    }
    public abstract get qOrigin(): Float32Array;
    public abstract get qScale(): Float32Array;

    public abstract dispose(): void;

    public get materialInfo(): MaterialInfo | undefined {
        return undefined;
    }

    public get hasMaterialAtlas(): boolean {
        const mat = this.materialInfo;
        return undefined !== mat && mat.isAtlas;
    }

    public get polylineBuffers(): PolylineBuffers | undefined {
        return undefined;
    }

    public get hasFeatures(): boolean {
        return false;
    }

    public get viewIndependentOrigin(): Point3d | undefined {
        return undefined;
    }

    public get isViewIndependent(): boolean {
        return undefined !== this.viewIndependentOrigin;
    }

    public get supportsThematicDisplay() {
        return false;
    }

    public abstract build(): BufferGeometry;

    public get isEdge(): boolean {
        switch (this.renderOrder) {
            case RenderOrder.Edge:
            case RenderOrder.Silhouette:
            case RenderOrder.PlanarEdge:
            case RenderOrder.PlanarSilhouette:
                return true;
            default:
                return false;
        }
    }

    public computeRange(output?: Range3d): Range3d {
        if (undefined === this._range) {
            const lowX = this.qOrigin[0];
            const lowY = this.qOrigin[1];
            const lowZ = this.qOrigin[2];

            const hiX = 0xffff * this.qScale[0] + lowX;
            const hiY = 0xffff * this.qScale[1] + lowY;
            const hiZ = 0xffff * this.qScale[2] + lowZ;

            this._range = Range3d.createXYZXYZ(lowX, lowY, lowZ, hiX, hiY, hiZ);
        }

        return this._range.clone(output);
    }
}

export abstract class LUTGeometry extends CachedGeometry {
    private readonly _viewIndependentOrigin?: Point3d;

    public abstract get lutBuffers(): Record<string, BufferAttribute | InterleavedBufferAttribute>;

    public abstract get lut(): VertexLUT;
    public override get asLUT() {
        return this;
    }

    public override get viewIndependentOrigin() {
        return this._viewIndependentOrigin;
    }

    public getColor(target: Target): ColorInfo {
        return this.lut.colorInfo;
    }

    public override get usesQuantizedPositions() {
        return this.lut.usesQuantizedPositions;
    }

    public get qOrigin(): Float32Array {
        return this.lut.qOrigin;
    }

    public get qScale(): Float32Array {
        return this.lut.qScale;
    }

    public override get hasAnimation() {
        return this.lut.hasAnimation;
    }

    protected constructor(viewIndependentOrigin?: Point3d) {
        super();
        this._viewIndependentOrigin = viewIndependentOrigin;
    }
}

export class IndexedGeometryParams implements IDisposable {
    public buffers: Record<string, BufferAttribute>;
    public readonly positions: QBufferHandle3d;
    public readonly indices: Uint32BufferAttribute;
    public readonly numIndices: number;

    protected constructor(
        positions: QBufferHandle3d,
        indices: Uint32BufferAttribute,
        numIndices: number
    ) {
        this.buffers = {};
        this.buffers["a_pos"] = positions;
        this.buffers[""] = indices;
        this.positions = positions;
        this.indices = indices;
        this.numIndices = numIndices;
    }

    public static create(positions: Uint16Array, qParams: QParams3d, indices: Uint32Array) {
        const posBuf = QBufferHandle3d.create(qParams, positions);
        const indBuf = new Uint32BufferAttribute(indices, 1);
        if (undefined === posBuf || undefined === indBuf) return undefined;

        return new IndexedGeometryParams(posBuf, indBuf, indices.length);
    }

    public static createFromList(positions: QPoint3dList, indices: Uint32Array) {
        return IndexedGeometryParams.create(positions.toTypedArray(), positions.params, indices);
    }

    public dispose() {}
}

export abstract class IndexedGeometry extends CachedGeometry {
    protected readonly _params: IndexedGeometryParams;
    protected constructor(params: IndexedGeometryParams) {
        super();
        this._params = params;
    }

    public dispose() {
        dispose(this._params);
    }

    public get qOrigin() {
        return this._params.positions.origin;
    }

    public get qScale() {
        return this._params.positions.scale;
    }
}

export class PolylineBuffers implements IDisposable {
    public buffers: Record<string, BufferAttribute | InterleavedBufferAttribute>;
    public indices: Uint8BufferAttribute;
    public prevIndices: Uint8BufferAttribute;
    public attrNextIndexs: InterleavedBufferAttribute;
    public attrParams: InterleavedBufferAttribute;

    private constructor(
        indices: Uint8BufferAttribute,
        prevIndices: Uint8BufferAttribute,
        attrNextIndexs: InterleavedBufferAttribute,
        attrParams: InterleavedBufferAttribute
    ) {
        this.buffers = {};

        this.buffers["a_pos"] = indices;
        this.buffers["a_prevIndex"] = prevIndices;
        this.buffers["a_nextIndex"] = attrNextIndexs;
        this.buffers["a_param"] = attrParams;

        this.indices = indices;
        this.prevIndices = prevIndices;
        this.attrNextIndexs = attrNextIndexs;
        this.attrParams = attrParams;
    }

    public static create(polyline: TesselatedPolyline): PolylineBuffers | undefined {
        const indices = new Uint8BufferAttribute(polyline.indices.data, 3);
        const prev = new Uint8BufferAttribute(polyline.prevIndices.data, 3);
        const nextIndexsBuf = new InterleavedBuffer(polyline.nextIndicesAndParams, 4);
        const attrBuf = new InterleavedBuffer(polyline.nextIndicesAndParams, 4);

        const nextIndexs = new InterleavedBufferAttribute(nextIndexsBuf, 3, 0, false);
        const attrs = new InterleavedBufferAttribute(attrBuf, 1, 3, false);

        return new PolylineBuffers(indices, prev, nextIndexs, attrs);
    }

    public dispose() {}
}
