import { HiddenLine } from "../common";
import { AnimationNodeId } from "../common/render/animation-node-id";
import { Range3d } from "../core-geometry";
import { disposeArray, IDisposable } from "../utils";
import { RenderClipVolume } from "./render-clip-volume";
import { RenderGraphic } from "./render-graphic";

export interface GraphicBranchFrustum {
    is3d: boolean;
    scale: {
        x: number;
        y: number;
    };
}

export class GraphicBranch implements IDisposable {
    public readonly entries: RenderGraphic[] = [];
    public readonly ownsEntries: boolean;

    public realityModelRange?: Range3d;

    public animationId?: string;

    public animationNodeId?: AnimationNodeId | number;

    public constructor(ownsEntries: boolean = false) {
        this.ownsEntries = ownsEntries;
    }

    public add(graphic: RenderGraphic): void {
        this.entries.push(graphic);
    }

    public dispose() {
        this.clear();
    }

    public get isEmpty(): boolean {
        return this.entries.length === 0;
    }

    public clear(): void {
        if (this.ownsEntries) disposeArray(this.entries);
        else this.entries.length = 0;
    }
}

export interface GraphicBranchOptions {
    clipVolume?: RenderClipVolume;
    frustum?: GraphicBranchFrustum;
    viewAttachmentId?: string;
    hline?: HiddenLine.Settings;
}
