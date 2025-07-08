import { RenderFeatureTable, ViewFlags } from "../../common";
import { Range3d, Transform } from "../../core-geometry";
import { dispose, Id64String, IDisposable } from "../../utils";
import { GraphicBranch, GraphicBranchFrustum, GraphicBranchOptions } from "../graphic-branch";
import { BatchOptions } from "../graphic-builder";
import { RenderGraphic } from "../render-graphic";
import { ClipVolume } from "./clip-volume";
import { EdgeSettings } from "./edge-settings";

export abstract class Graphic extends RenderGraphic implements IDisposable {
    public abstract get isPickable(): boolean;
}

export class GraphicOwner extends Graphic {
    private readonly _graphic: Graphic;

    public constructor(graphic: Graphic) {
        super();
        this._graphic = graphic;
    }

    public get graphic(): RenderGraphic {
        return this._graphic;
    }

    public dispose(): void {}
    public disposeGraphic(): void {
        this.graphic.dispose();
    }

    public override get isPickable(): boolean {
        return this._graphic.isPickable;
    }
}

export interface BatchContext {
    batchId: number;
    viewAttachmentId?: Id64String;
}

export class Batch extends Graphic {
    public readonly graphic: RenderGraphic;
    public readonly featureTable: RenderFeatureTable;
    public readonly range: Range3d;
    private readonly _context: BatchContext = { batchId: 0 };

    public readonly options: BatchOptions;

    public get tileId(): string | undefined {
        return this.options.tileId;
    }

    public get locateOnly(): boolean {
        return this.options.locateOnly === true;
    }

    public get batchId() {
        return this._context.batchId;
    }

    public get viewAttachmentId() {
        return this._context.viewAttachmentId;
    }

    public setContext(batchId: number, branch: any) {
        this._context.batchId = batchId;
        this._context.viewAttachmentId = branch.viewAttachmentId;
    }

    public resetContext() {
        this._context.batchId = 0;
        this._context.viewAttachmentId = undefined;
    }

    public constructor(
        graphic: RenderGraphic,
        features: RenderFeatureTable,
        range: Range3d,
        options?: BatchOptions
    ) {
        super();
        this.graphic = graphic;
        this.featureTable = features;
        this.range = range;
        this.options = options ?? {};
    }

    public dispose() {
        dispose(this.graphic);
    }

    public override get isPickable(): boolean {
        return true;
    }
}

export class Branch extends Graphic {
    public readonly branch: GraphicBranch;
    public localToWorldTransform: Transform;
    public readonly clips?: ClipVolume;
    public readonly edgeSettings?: EdgeSettings;
    public readonly frustum?: GraphicBranchFrustum;
    public readonly viewAttachmentId?: Id64String;

    public constructor(
        branch: GraphicBranch,
        localToWorld: Transform,
        viewFlags?: ViewFlags,
        opts?: GraphicBranchOptions
    ) {
        super();
        this.branch = branch;
        this.localToWorldTransform = localToWorld;

        if (!opts) return;

        this.clips = opts.clipVolume as ClipVolume | undefined;
        this.frustum = opts.frustum;
        this.viewAttachmentId = opts.viewAttachmentId;

        if (opts.hline) this.edgeSettings = EdgeSettings.create(opts.hline);
    }

    public dispose() {
        this.branch.dispose();
    }

    public override get isPickable(): boolean {
        return this.branch.entries.some(gf => (gf as Graphic).isPickable);
    }
}

export class GraphicsArray extends Graphic {
    constructor(public graphics: RenderGraphic[]) {
        super();
    }

    public override get isPickable(): boolean {
        return this.graphics.some(x => (x as Graphic).isPickable);
    }

    public dispose() {
        for (const graphic of this.graphics) dispose(graphic);
        this.graphics.length = 0;
    }
}
