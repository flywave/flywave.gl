import { RenderSystem } from "./render/render-system";

export class App {
    private static _renderSystem?: RenderSystem;

    protected constructor() {}

    public static get renderSystem(): RenderSystem {
        return this._renderSystem!;
    }

    public static registerSystem(renderSystem: RenderSystem) {
        this._renderSystem = renderSystem;
    }
}
