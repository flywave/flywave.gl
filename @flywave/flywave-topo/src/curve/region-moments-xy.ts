/* Copyright (C) 2025 flywave.gl contributors */



import { type BSplineCurve3d } from "../bspline/bspline-curve";
import { type BSplineCurve3dH } from "../bspline/bspline-curve3d-homogeneous";
import { Angle } from "../geometry3d/angle";
import { NullGeometryHandler } from "../geometry3d/geometry-handler";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { MomentData } from "../geometry4d/moment-data";
import { type Arc3d } from "./arc3d";
import { type CurvePrimitive } from "./curve-primitive";
import { type LineSegment3d } from "./line-segment3d";
import { LineString3d } from "./line-string3d";
import { Loop } from "./loop";
import { type ParityRegion } from "./parity-region";
import { type TransitionSpiral3d } from "./spiral/transition-spiral3d";
import { StrokeOptions } from "./stroke-options";
import { type UnionRegion } from "./union-region";

/**
 * Implementation class for computing XY area moments.
 * @internal
 */
export class RegionMomentsXY extends NullGeometryHandler {
    private _activeMomentData?: MomentData;
    private readonly _point0 = Point3d.create();
    private readonly _point1 = Point3d.create();

    /** Accumulate (independent) integrations over
     * * origin to chord of the arc.
     * * origin to the "cap" between the chord and arc.
     */
    public override handleArc3d(arc: Arc3d): void {
        const momentData = this._activeMomentData!;
        const sweepRadians = arc.sweep.sweepRadians;
        const alphaRadians = sweepRadians * 0.5;
        // from https://apps.dtic.mil/dtic/tr/fulltext/u2/274936.pdf page 71  for radius = 1
        let s = Math.sin(alphaRadians);
        let c = Math.cos(alphaRadians);
        let s1 = Math.sin(sweepRadians);
        if (Angle.isFullCircleRadians(sweepRadians)) {
            s = 0.0;
            c = -1.0;
            s1 = 0.0;
        }
        const q = (2 * s * s * s * c) / (alphaRadians - s * c);
        const s3 = s * s * s;
        const s6 = s3 * s3;
        const area = 0.5 * (sweepRadians - s1);
        const inertiaXX = 0.25 * area * (1.0 - q / 3.0);
        const inertiaYY1 = 0.25 * area * (1.0 + q);
        const inertiaYY = inertiaYY1 - (4.0 * s6) / (9.0 * area);
        const productXX = inertiaYY;
        const productYY = inertiaXX;
        const centerToCentroid = (4.0 * s * s * s) / (3.0 * (sweepRadians - s1));
        const midRadians = arc.sweep.fractionToRadians(0.5);
        const centralPlane = arc.radiansToRotatedBasis(midRadians);
        const centroid = centralPlane.origin.plusScaled(centralPlane.vectorU, centerToCentroid);
        momentData.accumulateXYProductsInCentroidalFrame(
            productXX,
            0.0,
            productYY,
            area,
            centroid,
            centralPlane.vectorU,
            centralPlane.vectorV
        );
        const pointB = arc.fractionToPoint(0.0);
        const pointC = arc.fractionToPoint(1.0);
        momentData.accumulateTriangleMomentsXY(undefined, pointB, pointC);
    }

    /** Accumulate integrals over the (triangular) areas from the origin to each line segment */
    public override handleLineString3d(ls: LineString3d): void {
        const momentData = this._activeMomentData!;
        momentData.accumulateTriangleToLineStringMomentsXY(undefined, ls.packedPoints);
    }

    /** Accumulate integrals over the (triangular) area from the origin to this line segment */
    public override handleLineSegment3d(segment: LineSegment3d): void {
        const momentData = this._activeMomentData!;
        segment.startPoint(this._point0);
        segment.endPoint(this._point1);
        momentData.accumulateTriangleMomentsXY(undefined, this._point0, this._point1);
    }

    /** Accumulate integrals from origin to all primitives in the chain. */
    public override handleLoop(loop: Loop): MomentData | undefined {
        const momentData = (this._activeMomentData = MomentData.create());
        momentData.needOrigin = false;
        for (const child of loop.children) child.dispatchToGeometryHandler(this);
        this._activeMomentData = undefined;
        return momentData;
    }

    /**
     * ASSUMPTIONS FOR ORIENTATION AND CONTAINMENT ISSUES
     * * Largest area is outer
     * * All others are interior (and not overlapping)
     * Hence
     * * Outer area sign must be positive -- negate all integrations as needed
     * * Outer area signs must be positive -- negate all integrations as needed
     * @param region
     */
    public override handleParityRegion(region: ParityRegion): MomentData | undefined {
        const allChildMoments: MomentData[] = [];
        let maxAbsArea = 0.0;
        let largestChildMoments: MomentData | undefined;
        for (const child of region.children) {
            if (child instanceof Loop) {
                const childMoments = this.handleLoop(child);
                if (childMoments) {
                    allChildMoments.push(childMoments);
                    const q = Math.abs(childMoments.quantitySum);
                    if (q > maxAbsArea) {
                        maxAbsArea = q;
                        largestChildMoments = childMoments;
                    }
                }
            }
        }
        if (largestChildMoments) {
            const summedMoments = MomentData.create();
            const sign0 = largestChildMoments.signFactor(1.0);
            summedMoments.accumulateProducts(largestChildMoments, sign0);
            for (const childMoments of allChildMoments) {
                if (childMoments !== largestChildMoments) {
                    const sign1 = childMoments.signFactor(-1.0);
                    summedMoments.accumulateProducts(childMoments, sign1);
                }
            }
            return summedMoments;
        }
        return undefined;
    }

    /** Accumulate (as simple addition) products over each component of the union region. */
    public override handleUnionRegion(region: UnionRegion): MomentData | undefined {
        const summedMoments = MomentData.create();
        for (const child of region.children) {
            const childMoments = child.dispatchToGeometryHandler(this);
            if (childMoments) {
                const sign0 = childMoments.signFactor(1.0);
                summedMoments.accumulateProducts(childMoments, sign0);
            }
        }
        return summedMoments;
    }

    private _strokeOptions?: StrokeOptions;
    private getStrokeOptions(): StrokeOptions {
        if (this._strokeOptions) return this._strokeOptions;
        const options = StrokeOptions.createForCurves();
        // this is unusually fine for stroking, but appropriate for sum.
        options.angleTol = Angle.createDegrees(5.0);
        this._strokeOptions = options;
        return options;
    }

    /** Single curve primitive (not loop . . .).
     * * stroke the curve
     * * accumulate stroke array.
     */
    public handleCurvePrimitive(cp: CurvePrimitive) {
        const strokes = LineString3d.create();
        const options = this.getStrokeOptions();
        cp.emitStrokes(strokes, options);
        this.handleLineString3d(strokes);
    }

    /** handle strongly typed  BSplineCurve3d  as generic curve primitive */
    public override handleBSplineCurve3d(g: BSplineCurve3d) {
        this.handleCurvePrimitive(g);
    }

    /** handle strongly typed  BSplineCurve3dH  as generic curve primitive */
    public override handleBSplineCurve3dH(g: BSplineCurve3dH) {
        this.handleCurvePrimitive(g);
    }

    /** handle strongly typed  TransitionSpiral as generic curve primitive  */
    public override handleTransitionSpiral(g: TransitionSpiral3d) {
        this.handleCurvePrimitive(g);
    }
}
