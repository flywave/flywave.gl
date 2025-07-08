import { assert, dispose } from "../../utils";
import { InstancedGraphicParams } from "../instanced-graphic-params";
import { RenderAreaPattern } from "../render-system";
import { CachedGeometry, LUTGeometry } from "./cached-geometry";
import { Graphic } from "./graphic";
import {
    InstanceBuffers,
    InstancedGeometry,
    isInstancedGraphicParams,
    PatternBuffers
} from "./instanced-geometry";
import { RenderOrder } from "./render-flags";

export class Primitive extends Graphic {
    public cachedGeometry: CachedGeometry;
    public isPixelMode: boolean = false;

    protected constructor(cachedGeom: CachedGeometry) {
        super();
        this.cachedGeometry = cachedGeom;
    }

    public static create(
        geom: CachedGeometry | undefined,
        instances?: InstancedGraphicParams | RenderAreaPattern
    ): Primitive | undefined {
        if (!geom) return undefined;

        if (instances) {
            assert(geom instanceof LUTGeometry, "Invalid geometry type for instancing");
            if (instances instanceof PatternBuffers) {
                geom = InstancedGeometry.createPattern(geom, true, instances);
            } else {
                assert(isInstancedGraphicParams(instances));
                const range = InstanceBuffers.computeRange(
                    geom.computeRange(),
                    instances.transforms,
                    instances.transformCenter
                );
                const instanceBuffers = InstanceBuffers.create(instances, range);
                if (!instanceBuffers) return undefined;

                geom = InstancedGeometry.create(geom, true, instanceBuffers);
            }
        }

        return new this(geom);
    }

    public static createShared(
        geom: CachedGeometry | undefined,
        instances?: InstanceBuffers | PatternBuffers
    ): Primitive | undefined {
        if (!geom) return undefined;

        if (instances) {
            assert(geom instanceof LUTGeometry, "Invalid geometry type for instancing");
            if (instances instanceof InstanceBuffers) {
                geom = InstancedGeometry.create(geom, false, instances);
            } else geom = InstancedGeometry.createPattern(geom, false, instances);
        }

        return new this(geom);
    }

    public get isPickable() {
        return false;
    }

    public dispose() {
        dispose(this.cachedGeometry);
    }

    public get hasFeatures(): boolean {
        return this.cachedGeometry.hasFeatures;
    }

    public get hasAnimation(): boolean {
        return this.cachedGeometry.hasAnimation;
    }

    public get isInstanced(): boolean {
        return this.cachedGeometry.isInstanced;
    }

    public get isLit(): boolean {
        return this.cachedGeometry.isLitSurface;
    }

    public get isEdge(): boolean {
        return this.cachedGeometry.isEdge;
    }

    public get renderOrder(): RenderOrder {
        return this.cachedGeometry.renderOrder;
    }

    public get hasMaterialAtlas(): boolean {
        return this.cachedGeometry.hasMaterialAtlas;
    }
}
