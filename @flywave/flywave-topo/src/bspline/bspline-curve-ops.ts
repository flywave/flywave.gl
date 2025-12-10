/* Copyright (C) 2025 flywave.gl contributors */



import { Geometry } from "../geometry";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Point3dArray } from "../geometry3d/point-helpers";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { BandedSystem } from "../numerics/banded-system";
import { BSplineCurve3d } from "./bspline-curve";
import {
    type InterpolationCurve3dOptions,
    type InterpolationCurve3dProps
} from "./interpolation-curve3d";
import { BSplineWrapMode, KnotVector } from "./knot-vector";

export class BSplineCurveOps {
    public static createThroughPoints(
        points: IndexedXYZCollection | Point3d[],
        order: number
    ): BSplineCurve3d | undefined {
        const numPoints = points.length;
        if (order > numPoints || order < 2) return undefined;
        const degree = order - 1;
        const bw = 1 + 2 * degree;
        const matrix = new Float64Array(bw * numPoints);
        const basisFunctions = new Float64Array(order);
        const rhs = new GrowableXYZArray();
        const knots = KnotVector.createUniformClamped(numPoints, order - 1, 0.0, 1.0);
        const xyz = Point3d.create();
        for (let basePointIndex = 0; basePointIndex < numPoints; basePointIndex++) {
            const u = knots.grevilleKnot(basePointIndex);
            const spanIndex = knots.knotToLeftKnotIndex(u);
            knots.evaluateBasisFunctions(spanIndex, u, basisFunctions);
            let maxIndex = 0;
            for (let i = 1; i < order; i++) {
                if (basisFunctions[i] > basisFunctions[maxIndex]) maxIndex = i;
            }
            const basisFunctionStartWithinRow = degree - maxIndex;
            const rowStart = basePointIndex * bw;
            for (let i = 0; i < order; i++) {
                const realColumn = basePointIndex - degree + basisFunctionStartWithinRow + i;
                if (rowStart + realColumn >= 0 && realColumn < numPoints) {
                    matrix[rowStart + basisFunctionStartWithinRow + i] = basisFunctions[i];
                }
            }
            if (points instanceof IndexedXYZCollection) {
                rhs.push(points.getPoint3dAtUncheckedPointIndex(basePointIndex, xyz));
            } else {
                rhs.push(points[basePointIndex].clone());
            }
        }
        const poles = BandedSystem.solveBandedSystemMultipleRHS(
            numPoints,
            bw,
            matrix,
            3,
            rhs.float64Data()
        );
        if (poles) {
            return BSplineCurve3d.create(poles, knots.knots, order);
        }
        return undefined;
    }

    public static createThroughPointsC2Cubic(
        options: InterpolationCurve3dOptions
    ): BSplineCurve3d | undefined {
        const validatedOptions = options.clone();
        if (!this.C2CubicFit.validateOptions(validatedOptions)) return undefined;

        const poles = this.C2CubicFit.constructPoles(validatedOptions);
        if (undefined === poles) return undefined;

        const fullKnots = this.C2CubicFit.convertFitParamsToCubicKnotVector(
            validatedOptions.knots,
            validatedOptions.closed
        );
        if (undefined === fullKnots) return undefined;

        const interpolant = BSplineCurve3d.create(poles, fullKnots, validatedOptions.order);

        if (validatedOptions.closed) {
            interpolant?.setWrappable(BSplineWrapMode.OpenByAddingControlPoints);
        }

        return interpolant;
    }
}

export namespace BSplineCurveOps {
    export class C2CubicFit {
        private static normalizeKnots(knots: number[] | undefined): boolean {
            if (undefined === knots || knots.length < 2) {
                knots = undefined;
                return false;
            }
            const myKnots = KnotVector.create(knots, 1, false);
            if (!myKnots.normalize()) {
                knots = undefined;
                return false;
            }
            for (let i = 0; i < knots.length; ++i) knots[i] = myKnots.knots[i];
            return true;
        }

        private static constructChordLengthParameters(fitPoints: Point3d[]): number[] | undefined {
            if (fitPoints.length < 2) return undefined;
            const params: number[] = [0.0];
            for (let i = 1; i < fitPoints.length; ++i) {
                params[i] = params[i - 1] + fitPoints[i].distance(fitPoints[i - 1]);
            }
            if (!this.normalizeKnots(params)) return undefined;
            return params;
        }

        private static constructUniformParameters(numParams: number): number[] | undefined {
            if (numParams < 2) return undefined;
            const knots = KnotVector.createUniformClamped(numParams + 2, 3, 0.0, 1.0);
            const params: number[] = [];
            for (let i = knots.leftKnotIndex; i <= knots.rightKnotIndex; ++i) {
                params.push(knots.knots[i]);
            }
            return params;
        }

        private static removeDuplicateFitPoints(options: InterpolationCurve3dOptions): boolean {
            if (undefined !== options.knots && options.knots.length !== options.fitPoints.length) {
                options.knots = undefined;
            }

            const newPts = GrowableXYZArray.create(options.fitPoints);
            const indices = newPts.findOrderedDuplicates();
            newPts.clear();

            for (let iRead = 0, iIndex = 0; iRead < options.fitPoints.length; ++iRead) {
                if (iRead === indices[iIndex]) ++iIndex;
                else newPts.push(options.fitPoints[iRead].clone());
            }
            options.fitPoints = newPts.getPoint3dArray();

            if (undefined !== options.knots) {
                const newKnots: number[] = [];
                for (let iRead = 0, iIndex = 0; iRead < options.knots.length; ++iRead) {
                    if (iRead === indices[iIndex]) ++iIndex;
                    else newKnots.push(options.knots[iRead]);
                }
                options.knots = newKnots.slice();
            }
            return true;
        }

        public static constructFitParametersFromPoints(
            fitPoints: Point3d[],
            isChordLength: number | undefined,
            closed: boolean | undefined
        ): number[] | undefined {
            let params: number[] | undefined;
            if (isChordLength || !closed) params = this.constructChordLengthParameters(fitPoints);
            if (undefined === params) params = this.constructUniformParameters(fitPoints.length);
            return params;
        }

        public static constructFitParameters(options: InterpolationCurve3dOptions): boolean {
            if (undefined === options.knots) {
                options.knots = this.constructFitParametersFromPoints(
                    options.fitPoints,
                    options.isChordLenKnots,
                    options.closed
                );
            }
            return options.knots?.length === options.fitPoints.length;
        }

        private static computeAlphaBetaGamma(
            alpha: number[],
            beta: number[],
            gamma: number[],
            index: number,
            deltaIPlus1: number,
            deltaI: number,
            deltaIMinus1: number,
            deltaIMinus2: number
        ) {
            let denomReciprocal = 1.0 / (deltaIMinus2 + deltaIMinus1 + deltaI);
            alpha[index] = deltaI * deltaI * denomReciprocal;
            beta[index] = deltaI * (deltaIMinus2 + deltaIMinus1) * denomReciprocal;

            denomReciprocal = 1.0 / (deltaIMinus1 + deltaI + deltaIPlus1);
            beta[index] += deltaIMinus1 * (deltaI + deltaIPlus1) * denomReciprocal;
            gamma[index] = deltaIMinus1 * deltaIMinus1 * denomReciprocal;

            denomReciprocal = 1.0 / (deltaIMinus1 + deltaI);
            alpha[index] *= denomReciprocal;
            beta[index] *= denomReciprocal;
            gamma[index] *= denomReciprocal;
        }

        private static setUpSystem2Points(
            alpha: number[],
            beta: number[],
            gamma: number[]
        ): boolean {
            if (alpha.length !== 2 || beta.length !== 2 || gamma.length !== 2) return false;

            alpha[0] = alpha[1] = gamma[0] = gamma[1] = 0.0;
            beta[0] = beta[1] = 1.0;
            return true;
        }

        private static setUpSystem3Points(
            alpha: number[],
            beta: number[],
            gamma: number[],
            options: InterpolationCurve3dOptions,
            useNaturalStartTangent: boolean,
            useNaturalEndTangent: boolean
        ): boolean {
            if (undefined === options.knots) return false;
            if (alpha.length !== 3 || beta.length !== 3 || gamma.length !== 3) return false;
            if (options.knots.length !== 3 || options.fitPoints.length !== 3) return false;

            let deltaIPlus1 = 0;
            let deltaI = 0;
            let deltaIMinus1 = 0;
            let deltaIMinus2 = 0;
            let sum = 0;
            let sumReciprocal = 0;

            if (useNaturalStartTangent) {
                alpha[0] = 0.0;
                deltaI = options.knots[1] - options.knots[0];
                deltaIPlus1 = options.knots[2] - options.knots[1];
                sum = deltaI + deltaIPlus1;
                sumReciprocal = 1.0 / sum;
                beta[0] = (deltaI + sum) * sumReciprocal;
                gamma[0] = -deltaI * sumReciprocal;
            } else {
                alpha[0] = gamma[0] = 0.0;
                beta[0] = 1.0;
            }

            deltaIMinus1 = options.knots[1] - options.knots[0];
            deltaI = options.knots[2] - options.knots[1];
            sumReciprocal = 1.0 / (deltaIMinus1 + deltaI);
            sumReciprocal *= sumReciprocal;
            alpha[1] = deltaI * deltaI * sumReciprocal;
            beta[1] = 2.0 * (deltaI * deltaIMinus1) * sumReciprocal;
            gamma[1] = deltaIMinus1 * deltaIMinus1 * sumReciprocal;

            if (useNaturalEndTangent) {
                deltaIMinus1 = options.knots[2] - options.knots[1];
                deltaIMinus2 = options.knots[1] - options.knots[0];
                sum = deltaIMinus2 + deltaIMinus1;
                sumReciprocal = 1.0 / sum;
                alpha[2] = -deltaIMinus1 * sumReciprocal;
                beta[2] = (deltaIMinus1 + sum) * sumReciprocal;
                gamma[2] = 0.0;
            } else {
                alpha[2] = gamma[2] = 0.0;
                beta[2] = 1.0;
            }
            return true;
        }

        private static setUpSystem4PointsOrMore(
            alpha: number[],
            beta: number[],
            gamma: number[],
            options: InterpolationCurve3dOptions,
            useNaturalStartTangent: boolean,
            useNaturalEndTangent: boolean
        ): boolean {
            if (undefined === options.knots) return false;
            if (
                alpha.length !== beta.length ||
                alpha.length !== gamma.length ||
                alpha.length !== options.knots.length
            ) {
                return false;
            }
            if (options.knots.length !== options.fitPoints.length) return false;

            const numIntervals = options.fitPoints.length - 1;
            const numIntervalsMinus1 = numIntervals - 1;
            let deltaIPlus1 = 0;
            let deltaI = 0;
            let deltaIMinus1 = 0;
            let deltaIMinus2 = 0;
            let sum = 0;
            let sumReciprocal = 0;

            if (options.closed) {
                deltaI = options.knots[1] - options.knots[0];
                deltaIMinus2 =
                    options.knots[numIntervalsMinus1] - options.knots[numIntervalsMinus1 - 1];
                deltaIMinus1 =
                    options.knots[numIntervalsMinus1 + 1] - options.knots[numIntervalsMinus1];
                deltaIPlus1 = options.knots[2] - options.knots[1];
                this.computeAlphaBetaGamma(
                    alpha,
                    beta,
                    gamma,
                    0,
                    deltaIPlus1,
                    deltaI,
                    deltaIMinus1,
                    deltaIMinus2
                );

                deltaIMinus2 = deltaIMinus1;
                deltaIMinus1 = deltaI;
                deltaI = options.knots[2] - options.knots[1];
                deltaIPlus1 = options.knots[3] - options.knots[2];
                this.computeAlphaBetaGamma(
                    alpha,
                    beta,
                    gamma,
                    1,
                    deltaIPlus1,
                    deltaI,
                    deltaIMinus1,
                    deltaIMinus2
                );

                deltaIPlus1 = deltaIMinus1;
                deltaI = options.knots[numIntervalsMinus1 + 1] - options.knots[numIntervalsMinus1];
                deltaIMinus2 =
                    options.knots[numIntervalsMinus1 - 1] - options.knots[numIntervalsMinus1 - 2];
                deltaIMinus1 =
                    options.knots[numIntervalsMinus1] - options.knots[numIntervalsMinus1 - 1];
                this.computeAlphaBetaGamma(
                    alpha,
                    beta,
                    gamma,
                    numIntervalsMinus1,
                    deltaIPlus1,
                    deltaI,
                    deltaIMinus1,
                    deltaIMinus2
                );
            } else {
                if (useNaturalStartTangent) {
                    alpha[0] = 0.0;
                    deltaI = options.knots[1] - options.knots[0];
                    deltaIPlus1 = options.knots[2] - options.knots[1];
                    sum = deltaI + deltaIPlus1;
                    sumReciprocal = 1.0 / sum;
                    beta[0] = (deltaI + sum) * sumReciprocal;
                    gamma[0] = -deltaI * sumReciprocal;
                } else {
                    alpha[0] = gamma[0] = 0.0;
                    beta[0] = 1.0;
                }

                deltaI = options.knots[2] - options.knots[1];
                deltaIMinus1 = options.knots[1] - options.knots[0];
                deltaIMinus2 = 0.0;
                deltaIPlus1 = options.knots[3] - options.knots[2];
                this.computeAlphaBetaGamma(
                    alpha,
                    beta,
                    gamma,
                    1,
                    deltaIPlus1,
                    deltaI,
                    deltaIMinus1,
                    deltaIMinus2
                );

                deltaI = options.knots[numIntervalsMinus1 + 1] - options.knots[numIntervalsMinus1];
                deltaIMinus1 =
                    options.knots[numIntervalsMinus1] - options.knots[numIntervalsMinus1 - 1];
                deltaIMinus2 =
                    options.knots[numIntervalsMinus1 - 1] - options.knots[numIntervalsMinus1 - 2];
                deltaIPlus1 = 0.0;
                this.computeAlphaBetaGamma(
                    alpha,
                    beta,
                    gamma,
                    numIntervalsMinus1,
                    deltaIPlus1,
                    deltaI,
                    deltaIMinus1,
                    deltaIMinus2
                );

                if (useNaturalEndTangent) {
                    deltaIMinus1 = options.knots[numIntervals] - options.knots[numIntervals - 1];
                    deltaIMinus2 =
                        options.knots[numIntervals - 1] - options.knots[numIntervals - 2];
                    sum = deltaIMinus2 + deltaIMinus1;
                    sumReciprocal = 1.0 / sum;
                    alpha[numIntervals] = -deltaIMinus1 * sumReciprocal;
                    beta[numIntervals] = (deltaIMinus1 + sum) * sumReciprocal;
                    gamma[numIntervals] = 0.0;
                } else {
                    alpha[numIntervals] = gamma[numIntervals] = 0.0;
                    beta[numIntervals] = 1.0;
                }
            }

            for (let i = 2; i < numIntervalsMinus1; ++i) {
                deltaI = options.knots[i + 1] - options.knots[i];
                deltaIMinus2 = options.knots[i - 1] - options.knots[i - 2];
                deltaIMinus1 = options.knots[i] - options.knots[i - 1];
                deltaIPlus1 = options.knots[i + 2] - options.knots[i + 1];
                this.computeAlphaBetaGamma(
                    alpha,
                    beta,
                    gamma,
                    i,
                    deltaIPlus1,
                    deltaI,
                    deltaIMinus1,
                    deltaIMinus2
                );
            }
            return true;
        }

        private static setUpSystem(
            alpha: number[],
            beta: number[],
            gamma: number[],
            options: InterpolationCurve3dOptions
        ): boolean {
            let useNaturalStartTangent = false;
            let useNaturalEndTangent = false;
            if (options.isNaturalTangents && !options.closed) {
                useNaturalStartTangent = undefined === options.startTangent;
                useNaturalEndTangent = undefined === options.endTangent;
            }

            let succeeded = false;
            if (options.fitPoints.length === 2) {
                succeeded = this.setUpSystem2Points(alpha, beta, gamma);
            } else if (options.fitPoints.length === 3) {
                succeeded = this.setUpSystem3Points(
                    alpha,
                    beta,
                    gamma,
                    options,
                    useNaturalStartTangent,
                    useNaturalEndTangent
                );
            } else if (options.fitPoints.length >= 4) {
                succeeded = this.setUpSystem4PointsOrMore(
                    alpha,
                    beta,
                    gamma,
                    options,
                    useNaturalStartTangent,
                    useNaturalEndTangent
                );
            }

            return succeeded;
        }

        private static setBesselEndCondition(
            dataPts: Point3d[],
            options: InterpolationCurve3dOptions,
            atStart: boolean
        ): boolean {
            if (dataPts.length !== options.fitPoints.length + 2) return false;
            if (undefined === options.knots) return false;

            const scale = 1.0 / 3.0;
            const numIntervals = options.fitPoints.length - 1;

            if (numIntervals === 1) {
                if (atStart) dataPts[0].interpolate(scale, dataPts[3], dataPts[1]);
                else dataPts[3].interpolate(scale, dataPts[0], dataPts[2]);
                return true;
            }

            if (numIntervals === 2) {
                const alpha =
                    (options.knots[2] - options.knots[1]) / (options.knots[2] - options.knots[0]);
                const beta = 1.0 - alpha;
                const temp = dataPts[2].plus2Scaled(
                    dataPts[0],
                    -alpha * alpha,
                    dataPts[4],
                    -beta * beta
                );
                if (atStart) {
                    Point3d.createAdd2Scaled(
                        temp,
                        1.0 / (2.0 * alpha),
                        dataPts[0],
                        alpha
                    ).interpolate(scale, dataPts[0], dataPts[1]);
                } else {
                    Point3d.createAdd2Scaled(
                        temp,
                        1.0 / (2.0 * beta),
                        dataPts[4],
                        beta
                    ).interpolate(scale, dataPts[4], dataPts[3]);
                }
                return true;
            }

            if (atStart) {
                const alpha =
                    (options.knots[2] - options.knots[1]) / (options.knots[2] - options.knots[0]);
                const beta = 1.0 - alpha;
                const temp = dataPts[2].plus2Scaled(
                    dataPts[0],
                    -alpha * alpha,
                    dataPts[3],
                    -beta * beta
                );
                Point3d.createAdd2Scaled(temp, 1.0 / (2.0 * alpha), dataPts[0], alpha).interpolate(
                    scale,
                    dataPts[0],
                    dataPts[1]
                );
            } else {
                const alpha =
                    (options.knots[numIntervals] - options.knots[numIntervals - 1]) /
                    (options.knots[numIntervals] - options.knots[numIntervals - 2]);
                const beta = 1.0 - alpha;
                const temp = dataPts[numIntervals].plus2Scaled(
                    dataPts[numIntervals - 1],
                    -alpha * alpha,
                    dataPts[numIntervals + 2],
                    -beta * beta
                );
                Point3d.createAdd2Scaled(
                    temp,
                    1.0 / (2.0 * beta),
                    dataPts[numIntervals + 2],
                    beta
                ).interpolate(scale, dataPts[numIntervals + 2], dataPts[numIntervals + 1]);
            }
            return true;
        }

        private static setNaturalEndCondition(
            dataPts: Point3d[],
            options: InterpolationCurve3dOptions,
            atStart: boolean
        ): boolean {
            if (dataPts.length !== options.fitPoints.length + 2) return false;

            const numIntervals = options.fitPoints.length - 1;
            if (numIntervals === 1) return this.setBesselEndCondition(dataPts, options, atStart);

            if (atStart) dataPts[1] = dataPts[0];
            else dataPts[dataPts.length - 2] = dataPts[dataPts.length - 1];
            return true;
        }

        private static setChordLengthScaledEndCondition(
            dataPts: Point3d[],
            options: InterpolationCurve3dOptions,
            atStart: boolean
        ): boolean {
            if (dataPts.length !== options.fitPoints.length + 2) return false;

            const tangent = atStart ? options.startTangent : options.endTangent;
            if (undefined === tangent) return false;

            let iExt = 0;
            let iSet = 0;
            let iInt = 0;

            const numIntervals = options.fitPoints.length - 1;
            if (numIntervals === 1) {
                if (atStart) {
                    iExt = 0;
                    iSet = 1;
                    iInt = 3;
                } else {
                    iExt = 3;
                    iSet = 2;
                    iInt = 0;
                }
            } else {
                if (atStart) {
                    iExt = 0;
                    iSet = 1;
                    iInt = 2;
                } else {
                    iExt = numIntervals + 2;
                    iSet = numIntervals + 1;
                    iInt = numIntervals;
                }
            }

            const chordLength = dataPts[iInt].distance(dataPts[iExt]);
            dataPts[iExt].plusScaled(tangent, chordLength / 3.0, dataPts[iSet]);
            return true;
        }

        private static setBesselLengthScaledEndCondition(
            dataPts: Point3d[],
            options: InterpolationCurve3dOptions,
            atStart: boolean
        ): boolean {
            if (dataPts.length !== options.fitPoints.length + 2) return false;

            const tangent = atStart ? options.startTangent : options.endTangent;
            if (undefined === tangent) return false;

            if (!this.setBesselEndCondition(dataPts, options, atStart)) return false;

            const numIntervals = options.fitPoints.length - 1;
            const iExt = atStart ? 0 : numIntervals + 2;
            const iSet = atStart ? 1 : numIntervals + 1;

            dataPts[iExt].plusScaled(tangent, dataPts[iExt].distance(dataPts[iSet]), dataPts[iSet]);
            return true;
        }

        private static setPhysicallyClosedEndCondition(
            dataPts: Point3d[],
            options: InterpolationCurve3dOptions
        ): boolean {
            const numIntervals = options.fitPoints.length - 1;
            if (
                !options.isColinearTangents ||
                numIntervals <= 2 ||
                (undefined !== options.startTangent && undefined !== options.endTangent) ||
                options.isNaturalTangents ||
                !dataPts[0].isAlmostEqual(dataPts[numIntervals + 2])
            ) {
                return true;
            }
            if (undefined !== options.startTangent) {
                const outwardStartTangent = Vector3d.createStartEnd(
                    dataPts[1],
                    dataPts[0]
                ).normalize();
                if (undefined !== outwardStartTangent) {
                    const endTangentMag = dataPts[numIntervals + 2].distance(
                        dataPts[numIntervals + 1]
                    );
                    dataPts[numIntervals + 2].plusScaled(
                        outwardStartTangent,
                        endTangentMag,
                        dataPts[numIntervals + 1]
                    );
                }
            } else if (undefined !== options.endTangent) {
                const outwardEndTangent = Vector3d.createStartEnd(
                    dataPts[numIntervals + 1],
                    dataPts[numIntervals + 2]
                ).normalize();
                if (undefined !== outwardEndTangent) {
                    const startTangentMag = dataPts[0].distance(dataPts[1]);
                    dataPts[0].plusScaled(outwardEndTangent, startTangentMag, dataPts[1]);
                }
            } else {
                const commonTangent = Vector3d.createStartEnd(
                    dataPts[numIntervals + 1],
                    dataPts[1]
                ).normalize();
                if (undefined !== commonTangent) {
                    const startTangentMag = dataPts[0].distance(dataPts[1]);
                    dataPts[0].plusScaled(commonTangent, startTangentMag, dataPts[1]);
                    const endTangentMag = dataPts[numIntervals + 2].distance(
                        dataPts[numIntervals + 1]
                    );
                    dataPts[numIntervals + 2].plusScaled(
                        commonTangent,
                        -endTangentMag,
                        dataPts[numIntervals + 1]
                    );
                }
            }
            return true;
        }

        private static setEndConditions(
            dataPts: Point3d[],
            options: InterpolationCurve3dOptions
        ): boolean {
            if (dataPts.length !== options.fitPoints.length) return false;

            const dummy0 = Point3d.createZero();
            const dummy1 = Point3d.createZero();
            dataPts.splice(1, 0, dummy0);
            dataPts.splice(dataPts.length - 1, 0, dummy1);

            let succeeded = false;
            if (undefined === options.startTangent) {
                if (options.isNaturalTangents) {
                    succeeded = this.setNaturalEndCondition(dataPts, options, true);
                } else succeeded = this.setBesselEndCondition(dataPts, options, true);
            } else {
                if (options.isChordLenTangents) {
                    succeeded = this.setChordLengthScaledEndCondition(dataPts, options, true);
                } else succeeded = this.setBesselLengthScaledEndCondition(dataPts, options, true);
            }

            if (undefined === options.endTangent) {
                if (options.isNaturalTangents) {
                    succeeded = this.setNaturalEndCondition(dataPts, options, false);
                } else succeeded = this.setBesselEndCondition(dataPts, options, false);
            } else {
                if (options.isChordLenTangents) {
                    succeeded = this.setChordLengthScaledEndCondition(dataPts, options, false);
                } else succeeded = this.setBesselLengthScaledEndCondition(dataPts, options, false);
            }

            if (succeeded) succeeded = this.setPhysicallyClosedEndCondition(dataPts, options);

            return succeeded;
        }

        private static solveNearTridiagonal(
            fitPts: Point3d[],
            alpha: number[],
            beta: number[],
            gamma: number[]
        ): Point3d[] | undefined {
            if (
                alpha.length !== beta.length ||
                alpha.length !== gamma.length ||
                alpha.length !== fitPts.length
            ) {
                return undefined;
            }
            const poles: Point3d[] = [];
            const numIntervals = fitPts.length - 1;
            const leftPts = fitPts.slice(0, -1);
            let tmp: number | undefined = 0.0;

            for (let i = 1; i < numIntervals; ++i) {
                if (
                    undefined === (tmp = Geometry.conditionalDivideFraction(-alpha[i], beta[i - 1]))
                ) {
                    return undefined;
                }
                beta[i] += tmp * gamma[i - 1];
                alpha[i] = tmp * alpha[i - 1];
                leftPts[i].addScaledInPlace(leftPts[i - 1], tmp);
            }

            if (
                undefined ===
                (tmp = Geometry.conditionalDivideFraction(
                    1.0,
                    beta[numIntervals - 1] + alpha[numIntervals - 1]
                ))
            ) {
                return undefined;
            }
            gamma[numIntervals - 1] *= tmp;
            leftPts[numIntervals - 1].scaleInPlace(tmp);
            for (let i = numIntervals - 2; i >= 0; --i) {
                if (undefined === (tmp = Geometry.conditionalDivideFraction(1.0, beta[i]))) {
                    return undefined;
                }
                Point3d.createScale(
                    leftPts[i].plus2Scaled(
                        leftPts[i + 1],
                        -gamma[i],
                        leftPts[numIntervals - 1],
                        -alpha[i]
                    ),
                    tmp,
                    leftPts[i]
                );
                gamma[i] = -(gamma[i] * gamma[i + 1] + alpha[i] * gamma[numIntervals - 1]) * tmp;
            }

            if (undefined === (tmp = Geometry.conditionalDivideFraction(1.0, 1.0 + gamma[0]))) {
                return undefined;
            }
            poles.push(Point3d.createScale(leftPts[0], tmp));
            for (let i = 1; i < numIntervals; ++i) {
                poles.push(leftPts[i].plusScaled(poles[0], -gamma[i]));
            }
            return poles;
        }

        public static validateOptions(options: InterpolationCurve3dOptions): boolean {
            options.order = 4;

            options.knots = this.convertCubicKnotVectorToFitParams(
                options.knots,
                options.fitPoints.length,
                true
            );

            if (!this.removeDuplicateFitPoints(options)) return false;

            let hasClosurePoint = options.fitPoints[0].isAlmostEqual(
                options.fitPoints[options.fitPoints.length - 1]
            );
            if (options.fitPoints.length === 3 && hasClosurePoint) {
                options.fitPoints.pop();
                if (undefined !== options.knots) options.knots.pop();
                hasClosurePoint = options.fitPoints[0].isAlmostEqual(
                    options.fitPoints[options.fitPoints.length - 1]
                );
            }
            if (options.fitPoints.length <= 2) {
                if (hasClosurePoint) return false;
                options.closed = false;
            }

            if (options.closed) {
                if (!hasClosurePoint) {
                    options.fitPoints.push(options.fitPoints[0].clone());
                    if (undefined !== options.knots) {
                        options.knots.push(
                            options.knots[options.knots.length - 1] +
                                (options.knots[options.knots.length - 1] - options.knots[0]) /
                                    (options.knots.length - 1)
                        );
                    }
                }
                if (options.fitPoints.length <= 4) options.closed = false;
            }

            if (options.fitPoints.length < 2) return false;

            if (undefined !== options.startTangent) {
                if (options.startTangent.isAlmostZero) options.startTangent = undefined;
                else options.startTangent.normalizeInPlace();
            }
            if (undefined !== options.endTangent) {
                if (options.endTangent.isAlmostZero) options.endTangent = undefined;
                else options.endTangent.normalizeInPlace();
            }

            return true;
        }

        public static convertCubicKnotVectorToFitParams(
            knots: number[] | undefined,
            numFitPoints: number,
            normalize?: boolean
        ): number[] | undefined {
            let params = knots?.slice();
            if (undefined !== params) {
                const numExtraKnots = params.length - numFitPoints;
                switch (numExtraKnots) {
                    case 0: {
                        break;
                    }
                    case 4:
                    case 6: {
                        for (let i = 0; i < numExtraKnots / 2; ++i) {
                            params.pop();
                            params.shift();
                        }
                        break;
                    }
                    default: {
                        params = undefined;
                        break;
                    }
                }
                if (normalize && !this.normalizeKnots(params)) params = undefined;
            }
            return params;
        }

        public static convertFitParamsToCubicKnotVector(
            params: number[] | undefined,
            closed?: boolean,
            legacy?: boolean
        ): number[] | undefined {
            const knots = params?.slice();
            if (undefined !== knots) {
                const numExtraKnots = legacy ? 6 : 4;
                if (closed) {
                    const iTail = knots.length - 2;
                    for (let iHead = 2; iHead <= numExtraKnots; iHead += 2) {
                        knots.unshift(knots[iTail] - 1.0);
                        knots.push(1.0 + knots[iHead]);
                    }
                } else {
                    for (let i = 0; i < numExtraKnots / 2; ++i) {
                        knots.unshift(0.0);
                        knots.push(1.0);
                    }
                }
            }
            return knots;
        }

        public static convertToJsonKnots(props: InterpolationCurve3dProps) {
            if (undefined !== props.knots) {
                props.knots = this.convertCubicKnotVectorToFitParams(
                    props.knots,
                    props.fitPoints.length,
                    false
                );
                props.knots = this.convertFitParamsToCubicKnotVector(
                    props.knots,
                    props.closed,
                    true
                );
            } else {
                props.knots = this.constructFitParametersFromPoints(
                    Point3dArray.clonePoint3dArray(props.fitPoints),
                    props.isChordLenKnots,
                    props.closed
                );
                props.knots = this.convertFitParamsToCubicKnotVector(
                    props.knots,
                    props.closed,
                    true
                );
            }
        }

        public static constructPoles(
            options: InterpolationCurve3dOptions
        ): Point3d[] | Float64Array | undefined {
            if (!this.constructFitParameters(options) || undefined === options.knots) {
                return undefined;
            }

            const numRow = options.fitPoints.length;
            const alpha: number[] = Array(numRow);
            const beta: number[] = Array(numRow);
            const gamma: number[] = Array(numRow);
            if (!this.setUpSystem(alpha, beta, gamma, options)) return undefined;

            let poles: Point3d[] | Float64Array | undefined = [];
            if (!options.closed) {
                const dataPts = options.fitPoints.slice();
                if (!this.setEndConditions(dataPts, options)) return undefined;
                if (dataPts.length !== numRow + 2) return undefined;

                const matrix = new Float64Array(numRow * 3);
                const rhs = new Float64Array(numRow * 3);
                for (let iRow = 0, iMatrixRead = 0, iRhsRead = 0; iRow < numRow; ++iRow) {
                    matrix[iMatrixRead++] = alpha[iRow];
                    matrix[iMatrixRead++] = beta[iRow];
                    matrix[iMatrixRead++] = gamma[iRow];
                    rhs[iRhsRead++] = dataPts[iRow + 1].x;
                    rhs[iRhsRead++] = dataPts[iRow + 1].y;
                    rhs[iRhsRead++] = dataPts[iRow + 1].z;
                }

                const solution = BandedSystem.solveBandedSystemMultipleRHS(
                    numRow,
                    3,
                    matrix,
                    3,
                    rhs
                );
                if (undefined === solution) return undefined;

                poles = new Float64Array(3 + solution.length + 3);
                let iWrite = 0;
                poles[iWrite++] = options.fitPoints[0].x;
                poles[iWrite++] = options.fitPoints[0].y;
                poles[iWrite++] = options.fitPoints[0].z;
                for (let iRead = 0; iRead < solution.length; ) {
                    poles[iWrite++] = solution[iRead++];
                }
                poles[iWrite++] = options.fitPoints[options.fitPoints.length - 1].x;
                poles[iWrite++] = options.fitPoints[options.fitPoints.length - 1].y;
                poles[iWrite++] = options.fitPoints[options.fitPoints.length - 1].z;
            } else {
                if (
                    undefined !==
                    (poles = this.solveNearTridiagonal(options.fitPoints, alpha, beta, gamma))
                ) {
                    if (poles.length > 2) {
                        poles.unshift(poles.pop()!);
                        for (let i = 0; i < options.order - 1; ++i) poles.push(poles[i].clone());
                    }
                }
            }
            return poles;
        }
    }
}
