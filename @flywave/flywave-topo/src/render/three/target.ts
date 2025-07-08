import { RenderTarget } from "three";

import { AnalysisStyle, ViewFlags } from "../../common";
import { IDisposable } from "../../utils";

export class Target implements IDisposable {
    protected _target: RenderTarget;
    public analysisStyle?: AnalysisStyle;
    private _analysisFraction: number = 0;
    public get analysisFraction(): number {
        return this._analysisFraction;
    }

    public set analysisFraction(fraction: number) {
        this._analysisFraction = fraction;
    }

    private readonly _drawNonLocatable = true;
    public get drawNonLocatable(): boolean {
        return this._drawNonLocatable;
    }

    private readonly _viewFlags: ViewFlags;

    constructor(target: RenderTarget) {
        this._target = target;
        this._viewFlags = new ViewFlags();
    }

    public get currentViewFlags(): ViewFlags {
        return this._viewFlags;
    }

    public dispose() {
        this._target.dispose();
    }
}
