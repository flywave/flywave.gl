import { IDisposable } from "../utils";

export abstract class RenderGraphic implements IDisposable {
    public abstract dispose(): void;
}

export type GraphicList = RenderGraphic[];
