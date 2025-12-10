/* Copyright (C) 2025 flywave.gl contributors */

import { type Expr, type MapEnv, type Value, Env } from "./Expr";
import { getPropertyValue } from "./PropertyValue";

export interface AttrEvaluationContext {
    /**
     * Expression evaluation environment containing variable bindings.
     */
    env: MapEnv;

    /**
     * Optional, cache of expression results.
     *
     * @see [[Expr.evaluate]]
     */
    cachedExprResults?: Map<Expr, Value>;
}

/**
 * Evaluate feature attr _without_ default value.
 *
 * @returns actual value or `undefined`
 */
export function evaluateTechniqueAttr<T = Value>(
    context: Env | AttrEvaluationContext,
    attrValue: T | Expr | undefined
): T | undefined;

/**
 * Evaluate feature attr _with_ default value.
 *
 * @returns actual value or `defaultValue`
 */
export function evaluateTechniqueAttr<T extends Value>(
    context: Env | AttrEvaluationContext,
    attrValue: T | Expr | undefined,
    defaultValue: T
): T;

export function evaluateTechniqueAttr<T = Value>(
    context: Env | AttrEvaluationContext,
    attrValue: Value | undefined,
    defaultValue?: T
): T | undefined {
    if (attrValue === undefined) {
        return defaultValue;
    }

    const result = Env.isEnv(context)
        ? getPropertyValue(attrValue, context)
        : getPropertyValue(attrValue, context.env, context.cachedExprResults);

    return result ?? defaultValue;
}
