import * as THREE from "three";

export interface ColorRGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

export function rgbaToHex(color: ColorRGBA): string {
    const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export class ColorMap {
    private textureSize: number;
    private readonly stratumColor: Map<string, ColorRGBA>;
    private readonly stratumTexture: Map<string, string>; // 存储纹理路径或URL
    private defaultStratum: ColorRGBA;
    private readonly faultColor: Map<string, ColorRGBA>;
    private faultHighlight: ColorRGBA;
    private defaultFault: ColorRGBA;
    private readonly collapseColor: Map<string, ColorRGBA>;
    private readonly defaultCollapse: ColorRGBA;

    constructor(cm?: {
        textureSize: number;
        stratumColor: Record<string, ColorRGBA>;
        stratumTexture: Record<string, string>;
        defaultStratum: ColorRGBA;
        faultColor: Record<string, ColorRGBA>;
        faultHighlight: ColorRGBA;
        defaultFault: ColorRGBA;
        collapseColor: Record<string, ColorRGBA>;
        defaultCollapse: ColorRGBA;
    }) {
        this.textureSize = cm?.textureSize || 512;
        this.stratumColor = new Map(Object.entries(cm?.stratumColor || {}));
        this.stratumTexture = new Map(Object.entries(cm?.stratumTexture || {}));
        this.defaultStratum = cm?.defaultStratum || { r: 200, g: 200, b: 200, a: 255 };
        this.faultColor = new Map(Object.entries(cm?.faultColor || {}));
        this.faultHighlight = cm?.faultHighlight || { r: 255, g: 0, b: 0, a: 255 };
        this.defaultFault = cm?.defaultFault || { r: 255, g: 100, b: 100, a: 255 };
        this.collapseColor = new Map(Object.entries(cm?.collapseColor || {}));
        this.defaultCollapse = cm?.defaultCollapse || { r: 128, g: 0, b: 128, a: 255 };
    }

    // 获取地层颜色
    getStratumColor(lithologyOrId: string): ColorRGBA {
        return this.stratumColor.get(lithologyOrId) || this.defaultStratum;
    }

    // 获取地层纹理路径
    getStratumTexture(lithologyOrId: string): THREE.DataTexture | undefined {
        const texture = new THREE.DataTexture(
            new Uint8Array(4 * this.textureSize * this.textureSize), // 初始化RGBA数据
            this.textureSize,
            this.textureSize,
            THREE.RGBAFormat
        );
        texture.needsUpdate = true;
        return texture;
    }

    // 检查是否存在纹理
    hasStratumTexture(lithologyOrId: string): boolean {
        return this.stratumTexture.has(lithologyOrId);
    }

    // 获取断层颜色
    getFaultColor(faultID: string): ColorRGBA {
        return this.faultColor.get(faultID) || this.defaultFault;
    }

    // 获取陷落柱颜色
    getCollapseColor(collapseID: string): ColorRGBA {
        return this.collapseColor.get(collapseID) || this.defaultCollapse;
    }

    // 添加地层样式规则
    addStratumRule(stratumID: string, color: ColorRGBA, texturePath?: string): void {
        this.stratumColor.set(stratumID, color);
        if (texturePath) {
            this.stratumTexture.set(stratumID, texturePath);
        }
    }

    // 添加断层样式规则
    addFaultRule(faultID: string, color: ColorRGBA): void {
        this.faultColor.set(faultID, color);
    }

    // 获取断层高亮颜色
    getFaultHighlight(): ColorRGBA {
        return this.faultHighlight;
    }

    // 设置断层高亮颜色
    setFaultHighlight(color: ColorRGBA): void {
        this.faultHighlight = color;
    }

    // 或者通过十六进制颜色设置
    setFaultHighlightFromHex(hex: string): void {
        this.faultHighlight = this.parseHexColor(hex);
    }

    // 从JSON配置加载
    load(config: {
        textureSize?: number;
        stratum?: {
            colors?: Record<string, string>;
            textures?: Record<string, string>;
            defaultColor?: string;
        };
        fault?: {
            colors?: Record<string, string>;
            defaultColor?: string;
            highlightColor?: string;
        };
    }): void {
        if (config.textureSize) {
            this.textureSize = config.textureSize;
        }

        // 解析地层配置
        if (config.stratum?.defaultColor) {
            this.defaultStratum = this.parseHexColor(config.stratum.defaultColor);
        }
        if (config.stratum?.colors) {
            for (const [id, hex] of Object.entries(config.stratum.colors)) {
                this.stratumColor.set(id, this.parseHexColor(hex));
            }
        }
        if (config.stratum?.textures) {
            for (const [id, path] of Object.entries(config.stratum.textures)) {
                this.stratumTexture.set(id, path);
            }
        }

        // 解析断层配置
        if (config.fault?.defaultColor) {
            this.defaultFault = this.parseHexColor(config.fault.defaultColor);
        }
        if (config.fault?.highlightColor) {
            this.faultHighlight = this.parseHexColor(config.fault.highlightColor);
        }
        if (config.fault?.colors) {
            for (const [id, hex] of Object.entries(config.fault.colors)) {
                this.faultColor.set(id, this.parseHexColor(hex));
            }
        }
    }

    // 解析十六进制颜色
    private parseHexColor(hex: string): ColorRGBA {
        hex = hex.replace(/^#/, "");

        let r = 0;
        let g = 0;
        let b = 0;
        let a = 255;

        switch (hex.length) {
            case 3: // RGB
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
                break;
            case 4: // RGBA
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
                a = parseInt(hex[3] + hex[3], 16);
                break;
            case 6: // RRGGBB
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
                break;
            case 8: // RRGGBBAA
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
                a = parseInt(hex.substring(6, 8), 16);
                break;
            default:
                throw new Error(`Invalid color format: #${hex}`);
        }

        return { r, g, b, a };
    }
}
