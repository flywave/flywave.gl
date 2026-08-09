import { MBExpressionEngine, MBValue, MBExpressionContext, MBStyleFeature } from './MBExpressionEngine';
import { FilterSpecification } from './MBStyleSpec';

export type CompiledFilter = (ctx: MBExpressionContext) => boolean;

export class MBFilterCompiler {
    static compile(filter: FilterSpecification | undefined): CompiledFilter {
        if (filter === undefined) {
            return () => true;
        }

        if (this.isLegacyFilter(filter)) {
            return this.compileLegacy(filter);
        }

        return (ctx: MBExpressionContext): boolean => {
            return MBExpressionEngine.evaluate(filter, ctx) as boolean;
        };
    }

    private static isLegacyFilter(
        filter: FilterSpecification
    ): filter is any[] {
        if (!Array.isArray(filter)) return false;
        const op = filter[0];
        if (typeof op !== 'string') return false;

        // `within`/`!within` and the combinators `all`/`any`/`none` are valid in
        // both forms; the legacy compiler recurses through `compile()` so nested
        // sub-filters still get correct (expression vs legacy) dispatch.
        if (['all', 'any', 'none', 'within', '!within'].includes(op)) {
            return true;
        }

        // Atomic legacy operators are only legacy when the key is a plain string
        // (e.g. `["==", "class", "road"]`). Expression-form filters use an array
        // here (`["==", ["get","class"], "road"]`) and must go to the expression
        // engine — routing them to the legacy compiler treats the array as a
        // property key and culls every feature.
        return [
            'has', '!has', '==', '!=',
            '>', '>=', '<', '<=',
            'in', '!in',
        ].includes(op) && typeof filter[1] === 'string';
    }

    private static compileLegacy(filter: any[]): CompiledFilter {
        const op = filter[0] as string;

        switch (op) {
            case 'has': {
                const key = filter[1] as string;
                return (ctx) => {
                    return ctx.feature?.properties?.[key] !== undefined;
                };
            }
            case '!has': {
                const key = filter[1] as string;
                return (ctx) => {
                    return ctx.feature?.properties?.[key] === undefined;
                };
            }
            case '==': {
                const key = filter[1] as string;
                const val = filter[2];
                return (ctx) => {
                    return ctx.feature?.properties?.[key] === val;
                };
            }
            case '!=': {
                const key = filter[1] as string;
                const val = filter[2];
                return (ctx) => {
                    return ctx.feature?.properties?.[key] !== val;
                };
            }
            case '>': {
                const key = filter[1] as string;
                const val = filter[2] as number;
                return (ctx) => {
                    return (ctx.feature?.properties?.[key] as number) > val;
                };
            }
            case '>=': {
                const key = filter[1] as string;
                const val = filter[2] as number;
                return (ctx) => {
                    return (ctx.feature?.properties?.[key] as number) >= val;
                };
            }
            case '<': {
                const key = filter[1] as string;
                const val = filter[2] as number;
                return (ctx) => {
                    return (ctx.feature?.properties?.[key] as number) < val;
                };
            }
            case '<=': {
                const key = filter[1] as string;
                const val = filter[2] as number;
                return (ctx) => {
                    return (ctx.feature?.properties?.[key] as number) <= val;
                };
            }
            case 'in': {
                const key = filter[1] as string;
                const vals = filter.slice(2);
                return (ctx) => {
                    return vals.includes(ctx.feature?.properties?.[key]);
                };
            }
            case '!in': {
                const key = filter[1] as string;
                const vals = filter.slice(2);
                return (ctx) => {
                    return !vals.includes(ctx.feature?.properties?.[key]);
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
                    const subFilters = filter.slice(1).map((f: any) => this.compile(f));
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

    private static withinFilter(
        filterGeo: any,
        ctx: MBExpressionContext,
    ): boolean {
        // Delegate to the expression engine so legacy filters and the
        // expression form `["within", geo]` share the same geometry code.
        return MBExpressionEngine.featureWithin(ctx.feature, filterGeo) as boolean;
    }
}
