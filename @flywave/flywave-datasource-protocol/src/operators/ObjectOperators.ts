/* Copyright (C) 2025 flywave.gl contributors */

import { Env } from "../Env";
import { type CallExpr, type Expr, ExprScope } from "../Expr";
import { type ExprEvaluatorContext, type OperatorDescriptorMap } from "../ExprEvaluator";

const hasOwnProperty = Object.prototype.hasOwnProperty;

enum LookupMode {
    get,
    has
}

function lookupMember(context: ExprEvaluatorContext, args: Expr[], lookupMode: LookupMode) {
    const memberName = context.evaluate(args[0]);

    if (typeof memberName !== "string") {
        throw new Error(`expected the name of an attribute`);
    }

    const object = context.evaluate(args[1]) as any;

    if (object && typeof object === "object") {
        if (Env.isEnv(object)) {
            const value = object.lookup(memberName) ?? null;
            return lookupMode === LookupMode.get ? value : value !== null;
        }
        if (hasOwnProperty.call(object, memberName)) {
            return lookupMode === LookupMode.get ? object[memberName] : true;
        }
    }

    return lookupMode === LookupMode.get ? null : false;
}

const operators = {
    in: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            const object = context.evaluate(call.args[1]);
            if (typeof value === "string" && typeof object === "string") {
                return object.includes(value);
            } else if (Array.isArray(object)) {
                return object.includes(value);
            }
            return false;
        }
    },

    get: {
        call: (context: ExprEvaluatorContext, call: CallExpr) =>
            lookupMember(context, call.args, LookupMode.get)
    },

    has: {
        call: (context: ExprEvaluatorContext, call: CallExpr) =>
            lookupMember(context, call.args, LookupMode.has)
    },

    "dynamic-properties": {
        isDynamicOperator: () => true,
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            if (context.scope === ExprScope.Dynamic) {
                return context.env;
            }
            return call;
        }
    }
};

export const ObjectOperators: OperatorDescriptorMap = operators;
export type ObjectOperatorNames = keyof typeof operators;
