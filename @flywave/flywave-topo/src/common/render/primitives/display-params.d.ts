import { type ColorDef, type GraphicParams, type RenderMaterial, type RenderTexture, FillFlags, Gradient, LinePixels, TextureMapping } from "../../../common";
export declare class DisplayParams {
    static readonly minTransparency: number;
    readonly type: DisplayParams.Type;
    readonly material?: RenderMaterial;
    readonly gradient?: Gradient.Symb;
    private readonly _textureMapping?;
    readonly lineColor: ColorDef;
    readonly fillColor: ColorDef;
    readonly width: number;
    readonly linePixels: LinePixels;
    readonly fillFlags: FillFlags;
    readonly ignoreLighting: boolean;
    readonly pointSize: number;
    readonly lineWidth: number;
    readonly texture: RenderTexture;
    readonly tessellationTolerance: number;
    readonly twoSided: boolean;
    readonly maxTextureSize: number;
    constructor(type: DisplayParams.Type, lineColor: ColorDef, fillColor: ColorDef, width?: number, linePixels?: LinePixels, fillFlags?: FillFlags, material?: RenderMaterial, gradient?: Gradient.Symb, ignoreLighting?: boolean, textureMapping?: TextureMapping);
    /** Creates a DisplayParams object for a particular type (mesh, linear, text) based on the specified GraphicParams. */
    static createForType(type: DisplayParams.Type, gf: GraphicParams, resolveGradient?: (grad: Gradient.Symb) => RenderTexture | undefined, ignoreLighting?: boolean): DisplayParams;
    /** Creates a DisplayParams object that describes mesh geometry based on the specified GraphicParams. */
    static createForMesh(gf: GraphicParams, ignoreLighting: boolean, resolveGradient?: (grad: Gradient.Symb) => RenderTexture | undefined): DisplayParams;
    /** Creates a DisplayParams object that describes linear geometry based on the specified GraphicParams. */
    static createForLinear(gf: GraphicParams): DisplayParams;
    /** Creates a DisplayParams object that describes text geometry based on the specified GraphicParams. */
    static createForText(gf: GraphicParams): DisplayParams;
    get regionEdgeType(): DisplayParams.RegionEdgeType;
    get wantRegionOutline(): boolean;
    get hasBlankingFill(): boolean;
    get hasFillTransparency(): boolean;
    get hasLineTransparency(): boolean;
    get textureMapping(): TextureMapping | undefined;
    get isTextured(): boolean;
    /** Determines if the properties of this DisplayParams object are equal to those of another DisplayParams object.  */
    equals(rhs: DisplayParams, purpose?: DisplayParams.ComparePurpose): boolean;
    compareForMerge(rhs: DisplayParams): number;
    static adjustTransparency(color: ColorDef): ColorDef;
}
export declare namespace DisplayParams {
    enum Type {
        Mesh = 0,
        Linear = 1,
        Text = 2
    }
    enum RegionEdgeType {
        None = 0,
        Default = 1,
        Outline = 2
    }
    enum ComparePurpose {
        Merge = 0,// considers colors equivalent if both have or both lack transparency
        Strict = 1
    }
}
