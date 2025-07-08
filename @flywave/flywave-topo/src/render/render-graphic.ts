import { IDisposable } from "../utils";

export abstract class RenderGraphic implements IDisposable {
    public abstract dispose(): void;
}

export abstract class RenderGraphicOwner extends RenderGraphic {
    public abstract get graphic(): RenderGraphic;
    public dispose(): void {}
    public disposeGraphic(): void {
        this.graphic.dispose();
    }
}

export type GraphicList = RenderGraphic[];
