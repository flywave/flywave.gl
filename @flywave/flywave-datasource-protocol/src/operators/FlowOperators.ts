/* Copyright (C) 2025 flywave.gl contributors */

import { type CallExpr, type Expr } from "../Expr";
import { type ExprEvaluatorContext, type OperatorDescriptorMap } from "../ExprEvaluator";

function conditionalCast(context: ExprEvaluatorContext, type: string, args: Expr[]) {
    switch (type) {
        case "boolean":
        case "number":
        case "string":
            for (const childExpr of args) {
                const value = context.evaluate(childExpr);
                if (typeof value === type) {
                    return value;
                }
            }
            throw new Error(`expected a '${type}'`);
        default:
            throw new Error(`invalid type '${type}'`);
    } // switch
}

const operators = {
    all: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            for (const childExpr of call.args) {
                if (!context.evaluate(childExpr)) {
                    return false;
                }
            }
            return true;
        }
    },

    any: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            for (const childExpr of call.args) {
                if (context.evaluate(childExpr)) {
                    return true;
                }
            }
            return false;
        }
    },

    none: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            for (const childExpr of call.args) {
                if (context.evaluate(childExpr)) {
                    return false;
                }
            }
            return true;
        }
    },

    boolean: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return conditionalCast(context, "boolean", call.args);
        }
    },

    number: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return conditionalCast(context, "number", call.args);
        }
    },

    string: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return conditionalCast(context, "string", call.args);
        }
    }
};

export const FlowOperators: OperatorDescriptorMap = operators;
export type FlowOperatorNames = keyof typeof operators;
