/* Copyright (C) 2025 flywave.gl contributors */



import type { CurveCollection } from "./curve-collection";
import type { CurvePrimitive } from "./curve-primitive";
import type { Loop } from "./loop";
import type { ParityRegion } from "./parity-region";
import type { UnionRegion } from "./union-region";

/**
 * Union type for `GeometryQuery` classes that have contain curves, either as individual parameter space or as collections
 * @public
 */
export type AnyCurve = CurvePrimitive | CurveCollection;

/**
 * Union type for `GeometryQuery` classes that bound (planar) regions.
 * @public
 */
export type AnyRegion = Loop | ParityRegion | UnionRegion;
