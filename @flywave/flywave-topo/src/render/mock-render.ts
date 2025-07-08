import { RenderFeatureTable } from "../common";
import { MeshParams } from "../common/render/primitives/mesh-params";
import { PointStringParams } from "../common/render/primitives/point-string-params";
import { PolylineParams } from "../common/render/primitives/polyline-params";
import { Range3d, Transform } from "../core-geometry";
import { PrimitiveBuilder } from "../primitives/geometry/geometry-list-builder";
import { PointCloudArgs } from "../primitives/point-cloud-primitive";
import { dispose } from "../utils";
import { GraphicBranch, GraphicBranchOptions } from "./graphic-branch";
import {
    CustomGraphicBuilderOptions,
    GraphicBuilder,
    ViewportGraphicBuilderOptions
} from "./graphic-builder";
import { RenderGraphic } from "./render-graphic";
import { RenderAreaPattern, RenderGeometry, RenderSystem } from "./render-system";

export namespace MockRender {
    export class Builder extends PrimitiveBuilder {
        public constructor(
            system: System,
            options: CustomGraphicBuilderOptions | ViewportGraphicBuilderOptions
        ) {
            super(system, options);
        }
    }

    export class Graphic extends RenderGraphic {
        public constructor() {
            super();
        }

        public dispose() {}
    }

    export class List extends Graphic {
        public constructor(public readonly graphics: RenderGraphic[]) {
            super();
        }

        public override dispose() {
            for (const graphic of this.graphics) dispose(graphic);

            this.graphics.length = 0;
        }
    }

    export class Branch extends Graphic {
        public constructor(
            public readonly branch: GraphicBranch,
            public readonly transform: Transform,
            public readonly options?: GraphicBranchOptions
        ) {
            super();
        }

        public override dispose() {
            this.branch.dispose();
        }
    }

    export class Batch extends Graphic {
        public constructor(
            public readonly graphic: RenderGraphic,
            public readonly featureTable: RenderFeatureTable,
            public readonly range: Range3d
        ) {
            super();
        }

        public override dispose() {
            dispose(this.graphic);
        }
    }

    export class Geometry implements RenderGeometry {
        public dispose(): void {}
        public collectStatistics(): void {}
    }

    export class AreaPattern implements RenderAreaPattern {
        public dispose(): void {}
        public collectStatistics(): void {}
    }

    export class System extends RenderSystem {
        public get isValid() {
            return true;
        }

        public dispose(): void {}
        public override get maxTextureSize() {
            return 4096;
        }

        public constructor() {
            super();
        }

        public override createGraphic(
            options: CustomGraphicBuilderOptions | ViewportGraphicBuilderOptions
        ): GraphicBuilder {
            return new Builder(this, options);
        }

        public override createGraphicList(primitives: RenderGraphic[]) {
            return new List(primitives);
        }

        public override createGraphicBranch(
            branch: GraphicBranch,
            transform: Transform,
            options?: GraphicBranchOptions
        ) {
            return new Branch(branch, transform, options);
        }

        public override createBatch(
            graphic: RenderGraphic,
            features: RenderFeatureTable,
            range: Range3d
        ) {
            return new Batch(graphic, features, range);
        }

        /** @internal */
        public override createMesh(_params: MeshParams) {
            return new Graphic();
        }

        /** @internal */
        public override createPolyline(_params: PolylineParams) {
            return new Graphic();
        }

        /** @internal */
        public override createPointString(_params: PointStringParams) {
            return new Graphic();
        }

        /** @internal */
        public override createPointCloud(_args: PointCloudArgs) {
            return new Graphic();
        }

        public override createRenderGraphic() {
            return new Graphic();
        }

        /** @internal */
        public override createMeshGeometry() {
            return new Geometry();
        }

        /** @internal */
        public override createPolylineGeometry() {
            return new Geometry();
        }

        /** @internal */
        public override createPointStringGeometry() {
            return new Geometry();
        }

        /** @internal */
        public override createAreaPattern() {
            return new AreaPattern();
        }
    }

    export type SystemFactory = () => RenderSystem;

    export class Factory {
        public static systemFactory: SystemFactory = () => Factory.createDefaultRenderSystem();

        public static system(): RenderSystem {
            return this.systemFactory();
        }

        protected static createDefaultRenderSystem() {
            return new System();
        }
    }
}
