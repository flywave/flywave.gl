import { ColorDef, HiddenLine, RenderMode, ViewFlags } from "../../common";
import { FloatRgba } from "./float-rgba";
import { LineCode } from "./line-code";
import { OvrFlags, RenderPass } from "./render-flags";

export class EdgeSettings {
    private readonly _color = FloatRgba.fromColorDef(ColorDef.white);
    private _colorOverridden = false;
    private _visibleLineCode?: number;
    private _visibleWeight?: number;
    private _hiddenLineCode?: number;
    private _hiddenWeight?: number;

    private _transparencyThreshold = 0;

    public static create(hline: HiddenLine.Settings | undefined): EdgeSettings {
        const settings = new EdgeSettings();
        settings.init(hline);
        return settings;
    }

    public init(hline: HiddenLine.Settings | undefined): void {
        this.clear();
        if (!hline) return;

        let threshold = hline.transparencyThreshold;
        threshold = Math.min(1, Math.max(0, threshold));
        this._transparencyThreshold = 1.0 - threshold;

        const vis = hline.visible;
        if (vis.color) {
            this._colorOverridden = true;
            this._color.setColorDef(vis.color);
        }

        this._visibleLineCode =
            undefined !== vis.pattern ? LineCode.valueFromLinePixels(vis.pattern) : undefined;
        this._visibleWeight = vis.width;

        const hid = hline.hidden;
        this._hiddenLineCode =
            undefined !== hid.pattern
                ? LineCode.valueFromLinePixels(hid.pattern)
                : this._visibleLineCode;

        this._hiddenWeight = undefined !== hid.width ? hid.width : this._visibleWeight;
        if (undefined !== this._hiddenWeight && undefined !== this._visibleWeight) {
            this._hiddenWeight = Math.min(this._visibleWeight, this._hiddenWeight);
        }
    }

    public computeOvrFlags(pass: RenderPass, vf: ViewFlags): OvrFlags {
        if (!this.isOverridden(vf)) return OvrFlags.None;

        let flags = this.getColor(vf) ? OvrFlags.Rgba : OvrFlags.Alpha;

        if (undefined !== this.getLineCode(pass, vf)) flags |= OvrFlags.LineCode;

        if (undefined !== this.getWeight(pass, vf)) flags |= OvrFlags.Weight;

        return flags;
    }

    public get transparencyThreshold(): number {
        return this._transparencyThreshold;
    }

    public getColor(vf: ViewFlags): FloatRgba | undefined {
        return this._colorOverridden && this.isOverridden(vf) ? this._color : undefined;
    }

    public getLineCode(pass: RenderPass, vf: ViewFlags): number | undefined {
        if (!this.isOverridden(vf)) return undefined;

        return RenderPass.HiddenEdge === pass ? this._hiddenLineCode : this._visibleLineCode;
    }

    public getWeight(pass: RenderPass, vf: ViewFlags): number | undefined {
        if (!this.isOverridden(vf)) return undefined;

        return RenderPass.HiddenEdge === pass ? this._hiddenWeight : this._visibleWeight;
    }

    private clear(): void {
        this._colorOverridden = false;
        this._visibleLineCode = this._visibleWeight = undefined;
        this._hiddenLineCode = this._hiddenWeight = undefined;
        this._transparencyThreshold = 0;
    }

    public wantContrastingColor(renderMode: RenderMode): boolean {
        return !this._colorOverridden && RenderMode.SolidFill === renderMode;
    }

    private isOverridden(vf: ViewFlags): boolean {
        switch (vf.renderMode) {
            case RenderMode.Wireframe:
                return false;
            case RenderMode.SmoothShade:
                return vf.visibleEdges;
            default:
                return true;
        }
    }
}
