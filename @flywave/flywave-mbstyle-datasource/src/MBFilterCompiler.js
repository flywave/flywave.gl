"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBFilterCompiler = void 0;
const MBExpressionEngine_1 = require("./MBExpressionEngine");
class MBFilterCompiler {
    static compile(filter) {
        if (filter === undefined) {
            return () => true;
        }
        if (this.isLegacyFilter(filter)) {
            return this.compileLegacy(filter);
        }
        return (ctx) => {
            return MBExpressionEngine_1.MBExpressionEngine.evaluate(filter, ctx);
        };
    }
    static isLegacyFilter(filter) {
        if (!Array.isArray(filter))
            return false;
        const op = filter[0];
        if (typeof op !== 'string')
            return false;
        if (['all', 'any', 'none', 'within', '!within'].includes(op)) {
            return true;
        }
        return [
            'has', '!has', '==', '!=',
            '>', '>=', '<', '<=',
            'in', '!in',
        ].includes(op) && typeof filter[1] === 'string';
    }
    static compileLegacy(filter) {
        const op = filter[0];
        switch (op) {
            case 'has': {
                const key = filter[1];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) !== undefined;
                };
            }
            case '!has': {
                const key = filter[1];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) === undefined;
                };
            }
            case '==': {
                const key = filter[1];
                const val = filter[2];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) === val;
                };
            }
            case '!=': {
                const key = filter[1];
                const val = filter[2];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) !== val;
                };
            }
            case '>': {
                const key = filter[1];
                const val = filter[2];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) > val;
                };
            }
            case '>=': {
                const key = filter[1];
                const val = filter[2];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) >= val;
                };
            }
            case '<': {
                const key = filter[1];
                const val = filter[2];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) < val;
                };
            }
            case '<=': {
                const key = filter[1];
                const val = filter[2];
                return (ctx) => {
                    var _a, _b;
                    return ((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]) <= val;
                };
            }
            case 'in': {
                const key = filter[1];
                const vals = filter.slice(2);
                return (ctx) => {
                    var _a, _b;
                    return vals.includes((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]);
                };
            }
            case '!in': {
                const key = filter[1];
                const vals = filter.slice(2);
                return (ctx) => {
                    var _a, _b;
                    return !vals.includes((_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[key]);
                };
            }
            case 'within': {
                const filterGeo = filter[1];
                return (ctx) => MBFilterCompiler.withinFilter(filterGeo, ctx);
            }
            case '!within': {
                const filterGeo = filter[1];
                return (ctx) => !MBFilterCompiler.withinFilter(filterGeo, ctx);
            }
            default: {
                if (typeof op === 'string' && ['all', 'any', 'none'].includes(op)) {
                    const subFilters = filter.slice(1).map((f) => this.compile(f));
                    if (op === 'all') {
                        return (ctx) => subFilters.every(f => f(ctx));
                    }
                    if (op === 'any') {
                        return (ctx) => subFilters.some(f => f(ctx));
                    }
                    if (op === 'none') {
                        return (ctx) => !subFilters.some(f => f(ctx));
                    }
                }
                return () => true;
            }
        }
    }
    static withinFilter(filterGeo, ctx) {
        return MBExpressionEngine_1.MBExpressionEngine.featureWithin(ctx.feature, filterGeo);
    }
}
exports.MBFilterCompiler = MBFilterCompiler;
//# sourceMappingURL=MBFilterCompiler.js.map