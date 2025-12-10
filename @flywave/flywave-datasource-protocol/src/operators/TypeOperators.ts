/* Copyright (C) 2025 flywave.gl contributors */

import { type CallExpr } from "../Expr";
import { type ExprEvaluatorContext, type OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    typeof: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return typeof context.evaluate(call.args[0]);
        }
    }
};

export const TypeOperators: OperatorDescriptorMap = operators;
export type TypeOperatorNames = keyof typeof operators;
