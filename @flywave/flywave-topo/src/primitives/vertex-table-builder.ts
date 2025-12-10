/* Copyright (C) 2025 flywave.gl contributors */



import {
    type ColorIndex,
    ColorDef,
    FillFlags,
    QParams2d,
    QParams3d,
    QPoint2d,
    QPoint3dList
} from "../common";
import { AuxChannelTable } from "../common/render/primitives/aux-channel-table";
import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type Point3dList } from "../common/render/primitives/mesh-primitive";
import {
    type SurfaceParams,
    createSurfaceMaterial,
    SurfaceType
} from "../common/render/primitives/surface-params";
import { VertexIndices } from "../common/render/primitives/vertex-indices";
import { type VertexTable, computeDimensions } from "../common/render/primitives/vertex-table";
import { type Point3d, Point2d, Range2d } from "../core-geometry";
import { assert } from "../utils";
import { createEdgeParams } from "./edge-params";
import { type MeshArgs, type PolylineArgs } from "./mesh/mesh-primitives";

export function createMeshParams(args: MeshArgs, maxDimension: number): MeshParams {
    const builder = createMeshBuilder(args);
    const vertices = builder.build(args.colors, maxDimension);

    const surfaceIndices = VertexIndices.fromArray(args.vertIndices);

    const surface: SurfaceParams = {
        type: builder.type,
        indices: surfaceIndices,
        fillFlags: args.fillFlags ?? FillFlags.ByView,
        hasBakedLighting: args.hasBakedLighting === true,
        textureMapping:
            undefined !== args.textureMapping
                ? { texture: args.textureMapping.texture, alwaysDisplayed: false }
                : undefined,
        material: createSurfaceMaterial(args.material)
    };

    const channels =
        undefined !== args.auxChannels
            ? AuxChannelTable.fromChannels(args.auxChannels, vertices.numVertices, maxDimension)
            : undefined;
    const edges = createEdgeParams(args);
    return {
        vertices,
        surface,
        edges,
        isPlanar: !!args.isPlanar,
        auxChannels: channels
    };
}

export abstract class VertexTableBuilder {
    public data?: Uint8Array;
    private _curIndex: number = 0;

    public abstract get numVertices(): number;
    public abstract get numRgbaPerVertex(): number;
    public abstract get qparams(): QParams3d;
    public abstract get usesUnquantizedPositions(): boolean;
    public get uvParams(): QParams2d | undefined {
        return undefined;
    }
    public abstract appendVertex(vertIndex: number): void;

    public appendColorTable(colorIndex: ColorIndex) {
        if (undefined !== colorIndex.nonUniform) {
            for (const color of colorIndex.nonUniform.colors) {
                this.appendColor(color);
            }
        }
    }

    protected advance(nBytes: number) {
        this._curIndex += nBytes;
        assert(this._curIndex <= this.data!.length);
    }

    protected append8(val: number) {
        assert(val >= 0);
        assert(val <= 0xff);
        assert(val === Math.floor(val));

        this.data![this._curIndex] = val;
        this.advance(1);
    }

    protected append16(val: number) {
        this.append8(val & 0x00ff);
        this.append8(val >>> 8);
    }

    protected append32(val: number) {
        this.append16(val & 0x0000ffff);
        this.append16(val >>> 16);
    }

    private appendColor(tbgr: number) {
        const colors = ColorDef.getColors(tbgr);

        colors.t = 255 - colors.t;

        switch (colors.t) {
            case 0:
                colors.r = colors.g = colors.b = 0;
                break;
            case 255:
                break;
            default: {
                const f = colors.t / 255.0;
                colors.r = Math.floor(colors.r * f + 0.5);
                colors.g = Math.floor(colors.g * f + 0.5);
                colors.b = Math.floor(colors.b * f + 0.5);
                break;
            }
        }

        this.append8(colors.r);
        this.append8(colors.g);
        this.append8(colors.b);
        this.append8(colors.t);
    }

    public build(colorIndex: ColorIndex, maxDimension: number): VertexTable {
        const { numVertices, numRgbaPerVertex } = this;
        const numColors = colorIndex.isUniform ? 0 : colorIndex.numColors;
        const dimensions = computeDimensions(
            numVertices,
            numRgbaPerVertex,
            numColors,
            maxDimension
        );
        assert(
            dimensions.width % numRgbaPerVertex === 0 || (numColors > 0 && dimensions.height === 1)
        );

        const data = new Uint8Array(dimensions.width * dimensions.height * 4);

        this.data = data;
        for (let i = 0; i < numVertices; i++) this.appendVertex(i);

        this.appendColorTable(colorIndex);

        this.data = undefined;

        return {
            data,
            qparams: this.qparams,
            usesUnquantizedPositions: this.usesUnquantizedPositions,
            width: dimensions.width,
            height: dimensions.height,
            hasTranslucency: colorIndex.hasAlpha,
            uniformColor: colorIndex.uniform,
            numVertices,
            numRgbaPerVertex,
            uvParams: this.uvParams
        };
    }

    public static buildFromPolylines(
        args: PolylineArgs,
        maxDimension: number
    ): VertexTable | undefined {
        const polylines = args.polylines;
        if (polylines.length === 0) return undefined;

        const builder = createPolylineBuilder(args);
        return builder.build(args.colors, maxDimension);
    }
}

type VertexData = PolylineArgs | MeshArgs;
type Quantized<T extends VertexData> = Omit<T, "points"> & { points: QPoint3dList };
type Unquantized<T extends VertexData> = Omit<T, "points"> & { points: Omit<Point3dList, "add"> };

// eslint-disable-next-line @typescript-eslint/no-redeclare
namespace Quantized {
    // eslint-disable-line @typescript-eslint/no-redeclare

    export class SimpleBuilder<T extends Quantized<VertexData>> extends VertexTableBuilder {
        public args: T;
        protected _qpoints: QPoint3dList;

        public constructor(args: T) {
            super();
            this._qpoints = args.points;
            this.args = args;
            assert(undefined !== this.args.points);
        }

        public get numVertices() {
            return this.args.points.length;
        }

        public get numRgbaPerVertex() {
            return 3;
        }

        public get usesUnquantizedPositions() {
            return false;
        }

        public get qparams() {
            return this._qpoints.params;
        }

        public appendVertex(vertIndex: number): void {
            this.appendPosition(vertIndex);
            this.appendColorIndex(vertIndex);
        }

        protected appendPosition(vertIndex: number) {
            this.append16(this._qpoints.list[vertIndex].x);
            this.append16(this._qpoints.list[vertIndex].y);
            this.append16(this._qpoints.list[vertIndex].z);
        }

        protected appendColorIndex(vertIndex: number) {
            if (undefined !== this.args.colors.nonUniform) {
                this.append16(this.args.colors.nonUniform.indices[vertIndex]);
            } else {
                this.advance(2);
            }
        }
    }

    export class MeshBuilder extends SimpleBuilder<Quantized<MeshArgs>> {
        public readonly type: SurfaceType;

        protected constructor(args: Quantized<MeshArgs>, type: SurfaceType) {
            super(args);
            this.type = type;
        }

        public static create(args: Quantized<MeshArgs>): MeshBuilder {
            const isLit = undefined !== args.normals && args.normals.length > 0;
            const isTextured = undefined !== args.textureMapping;

            let uvParams: QParams2d | undefined;

            if (args.textureMapping) {
                const uvRange = Range2d.createNull();
                const fpts = args.textureMapping.uvParams;
                const pt2d = new Point2d();
                if (undefined !== fpts && fpts.length > 0) {
                    for (let i = 0; i < args.points.length; i++) {
                        uvRange.extendPoint(Point2d.create(fpts[i].x, fpts[i].y, pt2d));
                    }
                }

                uvParams = QParams2d.fromRange(uvRange);
            }

            if (isLit) {
                return isTextured
                    ? new TexturedLitMeshBuilder(args, uvParams!)
                    : new LitMeshBuilder(args);
            } else {
                return isTextured
                    ? new TexturedMeshBuilder(args, uvParams!)
                    : new MeshBuilder(args, SurfaceType.Unlit);
            }
        }
    }

    class TexturedMeshBuilder extends MeshBuilder {
        private readonly _qparams: QParams2d;
        private readonly _qpoint = new QPoint2d();

        public constructor(
            args: Quantized<MeshArgs>,
            qparams: QParams2d,
            type: SurfaceType = SurfaceType.Textured
        ) {
            super(args, type);
            this._qparams = qparams;
            assert(undefined !== args.textureMapping);
        }

        public override get numRgbaPerVertex() {
            return 4;
        }

        public override get uvParams() {
            return this._qparams;
        }

        public override appendVertex(vertIndex: number) {
            this.appendPosition(vertIndex);
            this.appendNormal(vertIndex);
            this.appendUVParams(vertIndex);
        }

        protected appendNormal(_vertIndex: number): void {
            this.advance(2);
        } // no normal for unlit meshes

        protected appendUVParams(vertIndex: number) {
            this._qpoint.init(this.args.textureMapping!.uvParams[vertIndex], this._qparams);
            this.append16(this._qpoint.x);
            this.append16(this._qpoint.y);
        }
    }

    class TexturedLitMeshBuilder extends TexturedMeshBuilder {
        public constructor(args: Quantized<MeshArgs>, qparams: QParams2d) {
            super(args, qparams, SurfaceType.TexturedLit);
            assert(undefined !== args.normals);
        }

        protected override appendNormal(vertIndex: number) {
            this.append16(this.args.normals![vertIndex].value);
        }
    }

    class LitMeshBuilder extends MeshBuilder {
        public constructor(args: Quantized<MeshArgs>) {
            super(args, SurfaceType.Lit);
            assert(undefined !== args.normals);
        }

        public override get numRgbaPerVertex() {
            return 4;
        }

        public override appendVertex(vertIndex: number) {
            super.appendVertex(vertIndex);
            this.append16(this.args.normals![vertIndex].value);
            this.advance(2); // 2 unused bytes
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
namespace Unquantized {
    // eslint-disable-line @typescript-eslint/no-redeclare
    const u32Array = new Uint32Array(1);
    const f32Array = new Float32Array(u32Array.buffer);

    // colorIndex:  10
    // unused:      12
    export class SimpleBuilder<T extends Unquantized<VertexData>> extends VertexTableBuilder {
        public args: T;
        protected _points: Point3d[];
        private readonly _qparams3d: QParams3d;

        public constructor(args: T) {
            super();
            assert(!(args.points instanceof QPoint3dList));
            this._qparams3d = QParams3d.fromRange(args.points.range);
            this.args = args;
            this._points = args.points;
        }

        public get numVertices() {
            return this._points.length;
        }

        public get numRgbaPerVertex() {
            return 5;
        }

        public get usesUnquantizedPositions() {
            return true;
        }

        public get qparams() {
            return this._qparams3d;
        }

        public appendVertex(vertIndex: number): void {
            this.appendTransposePosAndFeatureNdx(vertIndex);
            this.appendColorIndex(vertIndex);
        }

        private appendFloat32(val: number) {
            f32Array[0] = val;
            this.append32(u32Array[0]);
        }

        private convertFloat32(val: number): number {
            f32Array[0] = val;
            return u32Array[0];
        }

        protected appendTransposePosAndFeatureNdx(vertIndex: number) {
            const pt = this._points[vertIndex];
            const x = this.convertFloat32(pt.x);
            const y = this.convertFloat32(pt.y);
            const z = this.convertFloat32(pt.z);
            this.append8(x & 0x000000ff);
            this.append8(y & 0x000000ff);
            this.append8(z & 0x000000ff);
            this.append8((x >>> 8) & 0x000000ff);
            this.append8((y >>> 8) & 0x000000ff);
            this.append8((z >>> 8) & 0x000000ff);
            this.append8((x >>> 16) & 0x000000ff);
            this.append8((y >>> 16) & 0x000000ff);
            this.append8((z >>> 16) & 0x000000ff);
            this.append8(x >>> 24);
            this.append8(y >>> 24);
            this.append8(z >>> 24);
        }

        protected appendPosition(vertIndex: number) {
            const pt = this._points[vertIndex];
            this.appendFloat32(pt.x);
            this.appendFloat32(pt.y);
            this.appendFloat32(pt.z);
        }

        protected _appendColorIndex(vertIndex: number) {
            if (undefined !== this.args.colors.nonUniform) {
                this.append16(this.args.colors.nonUniform.indices[vertIndex]);
            } else this.advance(2);
        }

        protected appendColorIndex(vertIndex: number) {
            this._appendColorIndex(vertIndex);
            this.advance(2);
        }
    }

    export class MeshBuilder extends SimpleBuilder<Unquantized<MeshArgs>> {
        public readonly type: SurfaceType;

        protected constructor(args: Unquantized<MeshArgs>, type: SurfaceType) {
            super(args);
            this.type = type;
        }

        public static create(args: Unquantized<MeshArgs>): MeshBuilder {
            const isLit = undefined !== args.normals && args.normals.length > 0;
            const isTextured = undefined !== args.textureMapping;

            let uvParams: QParams2d | undefined;

            if (args.textureMapping) {
                const uvRange = Range2d.createNull();
                const fpts = args.textureMapping.uvParams;
                const pt2d = new Point2d();
                if (undefined !== fpts && fpts.length > 0) {
                    for (let i = 0; i < args.points.length; i++) {
                        uvRange.extendPoint(Point2d.create(fpts[i].x, fpts[i].y, pt2d));
                    }
                }

                uvParams = QParams2d.fromRange(uvRange);
            }

            if (isLit) {
                return isTextured
                    ? new TexturedLitMeshBuilder(args, uvParams!)
                    : new LitMeshBuilder(args);
            } else {
                return isTextured
                    ? new TexturedMeshBuilder(args, uvParams!)
                    : new MeshBuilder(args, SurfaceType.Unlit);
            }
        }
    }

    // u: 10
    // v: 12
    class TexturedMeshBuilder extends MeshBuilder {
        private readonly _qparams: QParams2d;
        private readonly _qpoint = new QPoint2d();

        public constructor(
            args: Unquantized<MeshArgs>,
            qparams: QParams2d,
            type = SurfaceType.Textured
        ) {
            super(args, type);
            this._qparams = qparams;
            assert(undefined !== args.textureMapping);
        }

        public override get uvParams() {
            return this._qparams;
        }

        public override appendVertex(vertIndex: number) {
            super.appendVertex(vertIndex);

            this._qpoint.init(this.args.textureMapping!.uvParams[vertIndex], this._qparams);
            this.append16(this._qpoint.x);
            this.append16(this._qpoint.y);
        }

        protected override appendColorIndex() {}
    }

    // u: 10
    // v: 12
    // normal: 14
    // unused: 16
    class TexturedLitMeshBuilder extends TexturedMeshBuilder {
        public constructor(args: Unquantized<MeshArgs>, qparams: QParams2d) {
            super(args, qparams, SurfaceType.TexturedLit);
            assert(undefined !== args.normals);
        }

        public override get numRgbaPerVertex() {
            return 6;
        }

        public override appendVertex(vertIndex: number) {
            super.appendVertex(vertIndex);
            this.append16(this.args.normals![vertIndex].value);
            this.advance(2);
        }
    }

    // color: 10
    // normal: 12
    class LitMeshBuilder extends MeshBuilder {
        public constructor(args: Unquantized<MeshArgs>) {
            super(args, SurfaceType.Lit);
            assert(undefined !== args.normals);
        }

        protected override appendColorIndex(vertIndex: number) {
            super._appendColorIndex(vertIndex);
        }

        public override appendVertex(vertIndex: number) {
            super.appendVertex(vertIndex);
            this.append16(this.args.normals![vertIndex].value);
        }
    }
}

function createMeshBuilder(args: MeshArgs): VertexTableBuilder & { type: SurfaceType } {
    if (args.points instanceof QPoint3dList) {
        return Quantized.MeshBuilder.create(args as Quantized<MeshArgs>);
    } else return Unquantized.MeshBuilder.create(args as Unquantized<MeshArgs>);
}

function createPolylineBuilder(args: PolylineArgs): VertexTableBuilder {
    if (args.points instanceof QPoint3dList) {
        return new Quantized.SimpleBuilder(args as Quantized<PolylineArgs>);
    } else return new Unquantized.SimpleBuilder(args as Unquantized<PolylineArgs>);
}
