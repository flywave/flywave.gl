import { type FlatTheme, type ImageTexture, type Light, type Style } from "@flywave/flywave-datasource-protocol";
/**
 * Utility Class for Rendering IBCT Tests
 */
export declare class ThemeBuilder {
    private readonly m_useEmptyTheme;
    static readonly imageTextures: ImageTexture[];
    static readonly lights: Light[];
    static readonly markerStyle: Style;
    static readonly images: {
        "icon-to-load": {
            preload: boolean;
            url: any;
        };
        "red-icon": {
            url: string;
            preload: boolean;
        };
        "green-icon": {
            url: string;
            preload: boolean;
        };
        "white-icon": {
            url: string;
            preload: boolean;
        };
        "plus-icon": {
            url: string;
            preload: boolean;
        };
    };
    private readonly m_baseTheme;
    private m_theme;
    /**
     *
     * @param m_useEmptyTheme - If `true` initializes with an empty Theme, @default `false`
     *  The default uses some basic theme settings for initialization.
     */
    constructor(m_useEmptyTheme?: boolean);
    build(): FlatTheme;
    withFontCatalog(): this;
    withInvalidFontCatalog(): this;
    withMarkerStyle(): this;
    withStyle(style: Style): this;
}
