/* Copyright (C) 2025 flywave.gl contributors */



import { DisplayParams } from "../../common/render/primitives/display-params";
import {
    type CurveChain,
    type IndexedPolyface,
    type Loop,
    type Path,
    type Point3d,
    type Range3d,
    type SolidPrimitive,
    type Transform,
    PolyfaceBuilder,
    PolyfaceQuery,
    StrokeOptions,
    SweepContour
} from "../../core-geometry";
import { assert } from "../../utils";
import { PolyfacePrimitive, PolyfacePrimitiveList } from "../polyface";
import {
    StrokesPrimitive,
    StrokesPrimitiveList,
    StrokesPrimitivePointList,
    StrokesPrimitivePointLists
} from "../strokes";

export type PrimitiveGeometryType = Loop | Path | IndexedPolyface | SolidPrimitive;

export abstract class Geometry {
    public readonly transform: Transform;
    public readonly tileRange: Range3d;
    public readonly displayParams: DisplayParams;

    public constructor(transform: Transform, tileRange: Range3d, displayParams: DisplayParams) {
        this.transform = transform;
        this.tileRange = tileRange;
        this.displayParams = displayParams;
    }

    public static createFromPointString(
        pts: Point3d[],
        tf: Transform,
        tileRange: Range3d,
        params: DisplayParams
    ): Geometry {
        return new PrimitivePointStringGeometry(pts, tf, tileRange, params);
    }

    public static createFromLineString(
        pts: Point3d[],
        tf: Transform,
        tileRange: Range3d,
        params: DisplayParams
    ): Geometry {
        return new PrimitiveLineStringGeometry(pts, tf, tileRange, params);
    }

    public static createFromLoop(
        loop: Loop,
        tf: Transform,
        tileRange: Range3d,
        params: DisplayParams,
        disjoint: boolean
    ): Geometry {
        return new PrimitiveLoopGeometry(loop, tf, tileRange, params, disjoint);
    }

    public static createFromSolidPrimitive(
        primitive: SolidPrimitive,
        tf: Transform,
        tileRange: Range3d,
        params: DisplayParams
    ): Geometry {
        return new SolidPrimitiveGeometry(primitive, tf, tileRange, params);
    }

    public static createFromPath(
        path: Path,
        tf: Transform,
        tileRange: Range3d,
        params: DisplayParams,
        disjoint: boolean
    ): Geometry {
        return new PrimitivePathGeometry(path, tf, tileRange, params, disjoint);
    }

    public static createFromPolyface(
        ipf: IndexedPolyface,
        tf: Transform,
        tileRange: Range3d,
        params: DisplayParams
    ): Geometry {
        return new PrimitivePolyfaceGeometry(ipf, tf, tileRange, params);
    }

    protected abstract _getPolyfaces(
        facetOptions: StrokeOptions
    ): PolyfacePrimitiveList | undefined;
    protected abstract _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined;

    public getPolyfaces(tolerance: number): PolyfacePrimitiveList | undefined {
        const facetOptions = StrokeOptions.createForFacets();
        facetOptions.chordTol = tolerance;
        if (this.displayParams.isTextured) facetOptions.needParams = true;

        if (!this.displayParams.ignoreLighting) facetOptions.needNormals = true;

        return this._getPolyfaces(facetOptions);
    }

    public getStrokes(tolerance: number): StrokesPrimitiveList | undefined {
        const strokeOptions = StrokeOptions.createForCurves();
        strokeOptions.chordTol = tolerance;
        return this._getStrokes(strokeOptions);
    }

    public get hasTexture() {
        return this.displayParams.isTextured;
    }

    public doDecimate() {
        return false;
    }

    public doVertexCluster() {
        return true;
    }

    public part() {
        return undefined;
    }
}

export class PrimitivePathGeometry extends Geometry {
    public readonly path: Path;
    public readonly isDisjoint: boolean;

    public constructor(
        path: Path,
        tf: Transform,
        range: Range3d,
        params: DisplayParams,
        isDisjoint: boolean
    ) {
        super(tf, range, params);
        this.path = path;
        this.isDisjoint = isDisjoint;
    }

    protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
        return undefined;
    }

    protected _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
        return PrimitivePathGeometry.getStrokesForLoopOrPath(
            this.path,
            facetOptions,
            this.displayParams,
            this.isDisjoint,
            this.transform
        );
    }

    public static getStrokesForLoopOrPath(
        loopOrPath: Loop | Path,
        facetOptions: StrokeOptions,
        params: DisplayParams,
        isDisjoint: boolean,
        transform: Transform
    ): StrokesPrimitiveList | undefined {
        const strksList = new StrokesPrimitiveList();

        if (!loopOrPath.isAnyRegionType || params.wantRegionOutline) {
            const strksPts: StrokesPrimitivePointLists = new StrokesPrimitivePointLists();
            PrimitivePathGeometry.collectCurveStrokes(
                strksPts,
                loopOrPath,
                facetOptions,
                transform
            );

            if (strksPts.length > 0) {
                const isPlanar = loopOrPath.isAnyRegionType;
                assert(isPlanar === params.wantRegionOutline);
                const strksPrim: StrokesPrimitive = StrokesPrimitive.create(
                    params,
                    isDisjoint,
                    isPlanar
                );
                strksPrim.strokes = strksPts;
                strksList.push(strksPrim);
            }
        }

        return strksList;
    }

    private static collectCurveStrokes(
        strksPts: StrokesPrimitivePointLists,
        loopOrPath: CurveChain,
        facetOptions: StrokeOptions,
        trans: Transform
    ) {
        const strokes = loopOrPath.getPackedStrokes(facetOptions);
        if (undefined !== strokes) {
            const pts = strokes.getPoint3dArray();
            trans.multiplyPoint3dArrayInPlace(pts);
            strksPts.push(new StrokesPrimitivePointList(pts));
        }
    }
}

export class PrimitivePointStringGeometry extends Geometry {
    public readonly pts: Point3d[];

    public constructor(pts: Point3d[], tf: Transform, range: Range3d, params: DisplayParams) {
        super(tf, range, params);
        this.pts = pts;
    }

    protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
        return undefined;
    }

    protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
        const strksList = new StrokesPrimitiveList();
        const strksPts = new StrokesPrimitivePointLists(new StrokesPrimitivePointList(this.pts));

        const strksPrim: StrokesPrimitive = StrokesPrimitive.create(
            this.displayParams,
            true,
            false
        );
        strksPrim.strokes = strksPts;
        strksPrim.transform(this.transform);
        strksList.push(strksPrim);

        return strksList;
    }
}

export class PrimitiveLineStringGeometry extends Geometry {
    public readonly pts: Point3d[];

    public constructor(pts: Point3d[], tf: Transform, range: Range3d, params: DisplayParams) {
        super(tf, range, params);
        this.pts = pts;
    }

    protected _getPolyfaces(_facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
        return undefined;
    }

    protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
        const strksList = new StrokesPrimitiveList();
        const strksPts = new StrokesPrimitivePointLists(new StrokesPrimitivePointList(this.pts));

        const strksPrim: StrokesPrimitive = StrokesPrimitive.create(
            this.displayParams,
            false,
            false
        );
        strksPrim.strokes = strksPts;
        strksPrim.transform(this.transform);
        strksList.push(strksPrim);

        return strksList;
    }
}

export class PrimitiveLoopGeometry extends Geometry {
    public readonly loop: Loop;
    public readonly isDisjoint: boolean;

    public constructor(
        loop: Loop,
        tf: Transform,
        range: Range3d,
        params: DisplayParams,
        isDisjoint: boolean
    ) {
        super(tf, range, params);
        this.loop = loop;
        this.isDisjoint = isDisjoint;
    }

    protected _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
        if (!this.loop.isAnyRegionType) {
            return undefined;
        }

        const contour = SweepContour.createForLinearSweep(this.loop);
        if (contour !== undefined) {
            const pfBuilder: PolyfaceBuilder = PolyfaceBuilder.create(facetOptions);
            contour.emitFacets(pfBuilder, false, this.transform);
            const polyface = pfBuilder.claimPolyface();
            const wantEdges =
                DisplayParams.RegionEdgeType.Default === this.displayParams.regionEdgeType;
            const isPlanar = true;
            return new PolyfacePrimitiveList(
                PolyfacePrimitive.create(this.displayParams, polyface, wantEdges, isPlanar)
            );
        }

        return undefined;
    }

    protected _getStrokes(facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
        return PrimitivePathGeometry.getStrokesForLoopOrPath(
            this.loop,
            facetOptions,
            this.displayParams,
            this.isDisjoint,
            this.transform
        );
    }
}

export class PrimitivePolyfaceGeometry extends Geometry {
    public readonly polyface: IndexedPolyface;

    public constructor(
        polyface: IndexedPolyface,
        tf: Transform,
        range: Range3d,
        params: DisplayParams
    ) {
        super(tf, range, params);
        this.polyface = tf.isIdentity ? polyface : polyface.cloneTransformed(tf);
    }

    protected _getPolyfaces(facetOptions: StrokeOptions): PolyfacePrimitiveList | undefined {
        if (!this.hasTexture) {
            if (this.polyface.data.param) this.polyface.data.param.clear();

            if (this.polyface.data.paramIndex) this.polyface.data.paramIndex = [];
        }

        if (!facetOptions.needNormals) {
            if (this.polyface.data.normal) this.polyface.data.normal.clear();

            if (this.polyface.data.normalIndex) this.polyface.data.normalIndex = [];
        } else if (!this.polyface.data.normal || this.polyface.data.normal.length === 0) {
            PolyfaceQuery.buildAverageNormals(this.polyface);
        }

        return new PolyfacePrimitiveList(
            PolyfacePrimitive.create(this.displayParams, this.polyface)
        );
    }

    protected _getStrokes(_facetOptions: StrokeOptions): StrokesPrimitiveList | undefined {
        return undefined;
    }
}

export class SolidPrimitiveGeometry extends Geometry {
    public readonly primitive: SolidPrimitive;

    public constructor(
        primitive: SolidPrimitive,
        tf: Transform,
        range: Range3d,
        params: DisplayParams
    ) {
        super(tf, range, params);
        const xformPrim = tf.isIdentity ? primitive : primitive.cloneTransformed(tf);
        this.primitive = xformPrim !== undefined ? (xformPrim as SolidPrimitive) : primitive;
    }

    protected _getStrokes() {
        return undefined;
    }

    protected _getPolyfaces(opts: StrokeOptions): PolyfacePrimitiveList {
        const builder = PolyfaceBuilder.create(opts);
        builder.addGeometryQuery(this.primitive);
        return new PolyfacePrimitiveList(
            PolyfacePrimitive.create(this.displayParams, builder.claimPolyface())
        );
    }
}
