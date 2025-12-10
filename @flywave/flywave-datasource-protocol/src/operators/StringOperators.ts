/* Copyright (C) 2025 flywave.gl contributors */

import { type CallExpr } from "../Expr";
import { type ExprEvaluatorContext, type OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    concat: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return "".concat(...call.args.map(a => String(context.evaluate(a))));
        }
    },

    downcase: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return String(context.evaluate(call.args[0])).toLocaleLowerCase();
        }
    },

    upcase: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return String(context.evaluate(call.args[0])).toLocaleUpperCase();
        }
    },

    "~=": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.includes(right);
            }
            return false;
        }
    },

    "^=": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.startsWith(right);
            }
            return false;
        }
    },

    "$=": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.endsWith(right);
            }
            return false;
        }
    }
};

export const StringOperators: OperatorDescriptorMap = operators;
export type StringOperatorNames = keyof typeof operators;
