export interface ColorThemeLut {
    data: Uint8ClampedArray;
    n: number;
}
export declare function themeGeneration(): number;
export declare function bumpThemeGeneration(): void;
export declare function applyColorTheme(lut: ColorThemeLut | null | undefined, color: string): string;
export declare function applyColorThemeToPixels(lut: ColorThemeLut | null | undefined, data: Uint8ClampedArray | Uint8Array): void;
export declare function loadColorTheme(style: any): Promise<ColorThemeLut | null>;
//# sourceMappingURL=MBColorTheme.d.ts.map