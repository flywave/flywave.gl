import * as THREE from 'three';
import { SolidLineMaterial } from '@flywave/flywave-materials';
export interface MapLineMaterialParams {
    'line-color': string;
    'line-opacity': number;
    'line-width': number;
    'line-gap-width'?: number;
    'line-offset'?: number;
    'line-blur'?: number;
    'line-dasharray'?: number[];
    'line-cap'?: 'butt' | 'round' | 'square';
    'line-join'?: 'bevel' | 'round' | 'miter' | 'none';
    'line-gradient'?: Array<[number, string]>;
    'line-pattern'?: string;
    'line-translate'?: [number, number];
    'line-miter-limit'?: number;
    'line-round-limit'?: number;
    'line-emissive-strength'?: number;
    'line-blend-mode'?: 'default' | 'multiply' | 'additive';
}
export declare class MapLineMaterial extends SolidLineMaterial {
    private m_paint;
    private m_gradientTexture;
    private m_patternTexture;
    private m_patternUVOffset;
    private m_patternUVScale;
    private m_patternRepeat;
    private m_blur;
    private m_translateX;
    private m_translateY;
    private m_emissiveStrength;
    constructor(paint?: Partial<MapLineMaterialParams>, capabilities?: any);
    private getJoinMode;
    private getMiterLimit;
    private getRoundLimit;
    private setJoinType;
    setPatternTexture(texture: THREE.Texture | null, uvOffset?: [number, number], uvScale?: [number, number], repeat?: number): void;
    setPaint(paint: Partial<MapLineMaterialParams>): void;
    getPaint(): Readonly<MapLineMaterialParams>;
    private applyPaint;
    private buildGradientTexture;
    dispose(): void;
}
//# sourceMappingURL=MapLineMaterial.d.ts.map