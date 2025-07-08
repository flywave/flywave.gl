import { FeatureOverrides } from "../common";
import { ViewState } from "./view-state";

export namespace FeatureSymbology {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface Source {}

    export class Overrides extends FeatureOverrides {
        private _source?: Source;

        public get source(): Source | undefined {
            return this._source;
        }

        public constructor(view?: ViewState) {
            super();
            if (undefined !== view) {
                this.initFromView(view);
            }
        }

        public static withSource(source: Source, view?: ViewState): Overrides {
            const ovrs = new Overrides(view);
            ovrs._source = source;
            return ovrs;
        }

        public initFromView(view: ViewState): void {
            this._initFromView(view);
        }

        private _initFromView(view: ViewState): void {
            const { viewFlags } = view;
            const { constructions, dimensions, patterns } = viewFlags;

            this.neverDrawnAnimationNodes.clear();
            this.animationNodeOverrides.clear();

            this._constructions = constructions;
            this._dimensions = dimensions;
            this._patterns = patterns;
            this._lineWeights = viewFlags.weights;

            if (!view.is3d()) return;
        }
    }
}
