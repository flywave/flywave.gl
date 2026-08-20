import { MBExpressionContext } from './MBExpressionEngine';
import { FilterSpecification } from './MBStyleSpec';
export type CompiledFilter = (ctx: MBExpressionContext) => boolean;
export declare class MBFilterCompiler {
    static compile(filter: FilterSpecification | undefined): CompiledFilter;
    private static isLegacyFilter;
    private static compileLegacy;
    private static withinFilter;
}
//# sourceMappingURL=MBFilterCompiler.d.ts.map