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
        return [
            'has', '!has', '==', '!=',
            '>', '>=', '<', '<=',
            'in', '!in',
            'within', '!within',
        ].includes(op);
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

    private static pointInPolygon(
        px: number, py: number,
        ring: Array<[number, number]>,
    ): boolean {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi + 1e-15) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private static withinFilter(
        filterGeo: any,
        ctx: MBExpressionContext,
    ): boolean {
        if (!filterGeo || filterGeo.type !== 'Polygon') return true;
        const featureGeo = (ctx.feature as any)?._geom;
        if (!featureGeo) return true;

        const fx = featureGeo.coordinates?.[0] ?? 0;
        const fy = featureGeo.coordinates?.[1] ?? 0;

        const outerRing = filterGeo.coordinates?.[0];
        if (!outerRing) return false;

        if (!this.pointInPolygon(fx, fy, outerRing)) return false;

        for (let i = 1; i < filterGeo.coordinates.length; i++) {
            if (this.pointInPolygon(fx, fy, filterGeo.coordinates[i])) return false;
        }
        return true;
    }
}
