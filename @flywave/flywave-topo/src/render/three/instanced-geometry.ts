import {
    BufferAttribute,
    BufferGeometry,
    InstancedBufferGeometry,
    InterleavedBuffer,
    InterleavedBufferAttribute,
    Uint16BufferAttribute
} from "three";

import { Point3d, Range3d, Transform } from "../../core-geometry";
import { assert, dispose } from "../../utils";
import { InstancedGraphicParams, PatternGraphicParams } from "../instanced-graphic-params";
import { CachedGeometry, LUTGeometry } from "./cached-geometry";
import { Matrix4 } from "./matrix";

export function isInstancedGraphicParams(params: any): params is InstancedGraphicParams {
    return (
        typeof params === "object" &&
        typeof params.count === "number" &&
        params.transforms instanceof Float32Array &&
        params.transformCenter instanceof Point3d
    );
}

class InstanceData {
    public readonly numInstances: number;
    public readonly range: Range3d;

    private readonly _rtcOnlyTransform: Transform;
    private readonly _rtcModelTransform: Transform;
    private readonly _modelMatrix = Transform.createIdentity();

    protected constructor(numInstances: number, rtcCenter: Point3d, range: Range3d) {
        this.numInstances = numInstances;
        this.range = range;
        this._rtcOnlyTransform = Transform.createTranslation(rtcCenter);
        this._rtcModelTransform = this._rtcOnlyTransform.clone();
    }

    public getRtcModelTransform(modelMatrix: Transform): Transform {
        if (!this._modelMatrix.isAlmostEqual(modelMatrix)) {
            modelMatrix.clone(this._modelMatrix);
            modelMatrix.multiplyTransformTransform(this._rtcOnlyTransform, this._rtcModelTransform);
        }

        return this._rtcModelTransform;
    }

    public getRtcOnlyTransform(): Transform {
        return this._rtcOnlyTransform;
    }

    private static readonly _noFeatureId = new Float32Array([0, 0, 0]);
    public get patternFeatureId(): Float32Array {
        return InstanceData._noFeatureId;
    }
}

export interface PatternTransforms {
    readonly orgTransform: Matrix4;
    readonly localToModel: Matrix4;
    readonly symbolToLocal: Matrix4;
    readonly origin: Float32Array;
}

export class InstanceBuffers extends InstanceData {
    private static readonly _patternParams = new Float32Array([0, 0, 0, 0]);

    public readonly transforms: Float32Array;
    public readonly featureIds?: Uint8Array;
    public readonly hasFeatures: boolean;
    public readonly symbology?: Uint8Array;
    public readonly patternParams = InstanceBuffers._patternParams;
    public readonly patternTransforms = undefined;
    public readonly viewIndependentOrigin = undefined;

    private constructor(
        count: number,
        transforms: Float32Array,
        rtcCenter: Point3d,
        range: Range3d,
        symbology?: Uint8Array,
        featureIds?: Uint8Array
    ) {
        super(count, rtcCenter, range);
        this.transforms = transforms;
        this.featureIds = featureIds;
        this.hasFeatures = undefined !== featureIds;
        this.symbology = symbology;
    }

    public static create(
        params: InstancedGraphicParams,
        range: Range3d
    ): InstanceBuffers | undefined {
        const { count, featureIds, symbologyOverrides, transforms } = params;

        assert(count > 0 && Math.floor(count) === count);
        assert(count === transforms.length / 12);
        assert(undefined === featureIds || count === featureIds.length / 3);
        assert(undefined === symbologyOverrides || count * 8 === symbologyOverrides.length);

        return new InstanceBuffers(
            count,
            transforms,
            params.transformCenter,
            range,
            symbologyOverrides,
            featureIds
        );
    }

    public dispose() {}

    private static extendTransformedRange(
        tfs: Float32Array,
        i: number,
        range: Range3d,
        x: number,
        y: number,
        z: number
    ) {
        range.extendXYZ(
            tfs[i + 3] + tfs[i + 0] * x + tfs[i + 1] * y + tfs[i + 2] * z,
            tfs[i + 7] + tfs[i + 4] * x + tfs[i + 5] * y + tfs[i + 6] * z,
            tfs[i + 11] + tfs[i + 8] * x + tfs[i + 9] * y + tfs[i + 10] * z
        );
    }

    public static computeRange(
        reprRange: Range3d,
        tfs: Float32Array,
        rtcCenter: Point3d,
        out?: Range3d
    ): Range3d {
        const range = out ?? new Range3d();

        const numFloatsPerTransform = 3 * 4;
        assert(tfs.length % (3 * 4) === 0);

        for (let i = 0; i < tfs.length; i += numFloatsPerTransform) {
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.low.x,
                reprRange.low.y,
                reprRange.low.z
            );
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.low.x,
                reprRange.low.y,
                reprRange.high.z
            );
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.low.x,
                reprRange.high.y,
                reprRange.low.z
            );
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.low.x,
                reprRange.high.y,
                reprRange.high.z
            );
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.high.x,
                reprRange.low.y,
                reprRange.low.z
            );
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.high.x,
                reprRange.low.y,
                reprRange.high.z
            );
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.high.x,
                reprRange.high.y,
                reprRange.low.z
            );
            this.extendTransformedRange(
                tfs,
                i,
                range,
                reprRange.high.x,
                reprRange.high.y,
                reprRange.high.z
            );
        }

        range.low.addInPlace(rtcCenter);
        range.high.addInPlace(rtcCenter);

        return range.clone(out);
    }
}

export class PatternBuffers extends InstanceData {
    private readonly _featureId?: Float32Array;

    private constructor(
        count: number,
        rtcCenter: Point3d,
        range: Range3d,
        public readonly patternParams: Float32Array, // [ isAreaPattern, spacingX, spacingY, scale ]
        public readonly origin: Float32Array, // [ x, y ]
        public readonly orgTransform: Matrix4,
        public readonly localToModel: Matrix4,
        public readonly symbolToLocal: Matrix4,
        public readonly offsets: Float32Array,
        featureId: number | undefined,
        public readonly viewIndependentOrigin: Point3d | undefined
    ) {
        super(count, rtcCenter, range);
        this.patternTransforms = this;
        if (undefined !== featureId) {
            this._featureId = new Float32Array([
                (featureId & 0x0000ff) >>> 0,
                (featureId & 0x00ff00) >>> 8,
                (featureId & 0xff0000) >>> 16
            ]);
        }
    }

    public static create(params: PatternGraphicParams): PatternBuffers | undefined {
        const count = params.xyOffsets.byteLength / 2;
        assert(Math.floor(count) === count);

        const offsets = params.xyOffsets;
        if (!offsets) return undefined;

        return new PatternBuffers(
            count,
            new Point3d(),
            params.range,
            new Float32Array([1, params.spacing.x, params.spacing.y, params.scale]),
            new Float32Array([params.origin.x, params.origin.y]),
            Matrix4.fromTransform(params.orgTransform),
            Matrix4.fromTransform(params.patternToModel),
            Matrix4.fromTransform(Transform.createTranslation(params.symbolTranslation)),
            offsets,
            params.featureId,
            params.viewIndependentOrigin
        );
    }

    public readonly patternTransforms: PatternTransforms;

    public get hasFeatures(): boolean {
        return undefined !== this._featureId;
    }

    public override get patternFeatureId(): Float32Array {
        return this._featureId ?? super.patternFeatureId;
    }

    public dispose(): void {}
}

export class InstancedGeometry extends CachedGeometry {
    private readonly _buffersContainer: Record<
        string,
        BufferAttribute | InterleavedBufferAttribute
    >;

    private readonly _buffers: InstanceBuffers | PatternBuffers;
    private readonly _repr: LUTGeometry;
    private readonly _ownsBuffers: boolean;

    public getRtcModelTransform(modelMatrix: Transform) {
        return this._buffers.getRtcModelTransform(modelMatrix);
    }

    public getRtcOnlyTransform() {
        return this._buffers.getRtcOnlyTransform();
    }

    public override get viewIndependentOrigin(): Point3d | undefined {
        return this._buffers.viewIndependentOrigin;
    }

    public override get asInstanced() {
        return this;
    }

    public override get asLUT() {
        return this._repr.asLUT;
    }

    public override get asMesh() {
        return this._repr.asMesh;
    }

    public override get asSurface() {
        return this._repr.asSurface;
    }

    public override get asEdge() {
        return this._repr.asEdge;
    }

    public override get asSilhouette() {
        return this._repr.asSilhouette;
    }

    public override get asIndexedEdge() {
        return this._repr.asIndexedEdge;
    }

    public get renderOrder() {
        return this._repr.renderOrder;
    }

    public override get isLitSurface() {
        return this._repr.isLitSurface;
    }

    public override get hasBakedLighting() {
        return this._repr.hasBakedLighting;
    }

    public override get hasAnimation() {
        return this._repr.hasAnimation;
    }

    public get qOrigin() {
        return this._repr.qOrigin;
    }

    public get qScale() {
        return this._repr.qScale;
    }

    public override get materialInfo() {
        return this._repr.materialInfo;
    }

    public override get polylineBuffers() {
        return this._repr.polylineBuffers;
    }

    public override get isEdge() {
        return this._repr.isEdge;
    }

    public override get hasFeatures() {
        return this._buffers.hasFeatures;
    }

    public override get supportsThematicDisplay() {
        return this._repr.supportsThematicDisplay;
    }

    public static create(
        repr: LUTGeometry,
        ownsBuffers: boolean,
        buffers: InstanceBuffers
    ): InstancedGeometry {
        const container: Record<string, BufferAttribute | InterleavedBufferAttribute> = {};

        const numRows = 3;
        let row = 0;
        while (row < numRows) {
            // 3 rows per instance; 4 floats per row; 4 bytes per float.
            const floatsPerRow = 4;
            const bytesPerVertex = floatsPerRow * 4;
            const offset = row * bytesPerVertex;
            const stride = 3 * bytesPerVertex;
            const name = `a_instanceMatrixRow${row}`;
            const r = new InterleavedBuffer(buffers.transforms, stride);
            const rAttr = new InterleavedBufferAttribute(r, floatsPerRow, offset, false);
            container[name] = rAttr;
            row++;
        }

        if (buffers.symbology) {
            const instanceOverrides = new InterleavedBuffer(buffers.symbology, 4);
            const instanceRgba = new InterleavedBuffer(buffers.symbology, 4);

            const instanceOverridesAttrs = new InterleavedBufferAttribute(
                instanceOverrides,
                8,
                0,
                false
            );
            const instanceRgbaAttrs = new InterleavedBufferAttribute(instanceRgba, 8, 4, false);

            container["a_instanceOverrides"] = instanceOverridesAttrs;
            container["a_instanceRgba"] = instanceRgbaAttrs;
        }

        if (buffers.featureIds) {
            container["a_featureId"] = new Uint16BufferAttribute(buffers.featureIds, 3);
        }

        return new this(repr, ownsBuffers, buffers, container);
    }

    public static createPattern(
        repr: LUTGeometry,
        ownsBuffers: boolean,
        buffers: PatternBuffers
    ): InstancedGeometry {
        const container: Record<string, BufferAttribute | InterleavedBufferAttribute> = {};

        const x = new InterleavedBuffer(buffers.offsets, 1);
        const y = new InterleavedBuffer(buffers.offsets, 1);

        const attrX = new InterleavedBufferAttribute(x, 8, 0, false);
        const attrY = new InterleavedBufferAttribute(y, 8, 4, false);

        container["a_patternX"] = attrX;
        container["a_patternY"] = attrY;

        return new this(repr, ownsBuffers, buffers, container);
    }

    private constructor(
        repr: LUTGeometry,
        ownsBuffers: boolean,
        buffers: InstanceBuffers | PatternBuffers,
        container: Record<string, BufferAttribute | InterleavedBufferAttribute>
    ) {
        super();
        this._repr = repr;
        this._ownsBuffers = ownsBuffers;
        this._buffers = buffers;
        this._buffersContainer = container;
    }

    public dispose() {
        this._repr.dispose();
        if (this._ownsBuffers) dispose(this._buffers);
    }

    public override computeRange(output?: Range3d): Range3d {
        return this._buffers.range.clone(output);
    }

    public override build(): BufferGeometry {
        return new InstancedBufferGeometry();
    }

    public get patternParams(): Float32Array {
        return this._buffers.patternParams;
    }

    public get patternTransforms(): PatternTransforms | undefined {
        return this._buffers.patternTransforms;
    }

    public get patternFeatureId(): Float32Array {
        return this._buffers.patternFeatureId;
    }
}
