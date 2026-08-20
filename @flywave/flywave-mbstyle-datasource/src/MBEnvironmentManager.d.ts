import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { FogSpec, SkySpec, Light3DProperties } from './MBStyleSpec';
import { SpriteAtlas } from './materials/MapIconMaterial';
import { TerrainController } from './TerrainController';
export declare class MBEnvironmentManager {
    private m_mapView;
    private m_ambientLight;
    private m_directionalLight;
    private m_hemisphereLight;
    private m_fog;
    private m_skyMesh;
    private m_stars;
    private m_scene;
    get hasLighting(): boolean;
    get use3DLights(): boolean;
    private m_use3DLights;
    private m_ambientColor;
    private m_ambientIntensity;
    private m_directionalColor;
    private m_directionalIntensity;
    private m_directionalPolar;
    private m_3DAmbient;
    private m_3DDirectional;
    get brightness(): number;
    get lightingState(): {
        dir: THREE.Vector3;
        dirColor: THREE.Color;
        ambColor: THREE.Color;
        dirIntensity: number;
        ambIntensity: number;
    } | null;
    get lighting3DState(): {
        ambientColorLinear: [number, number, number];
        directionalColorLinear: [number, number, number];
        dir: [number, number, number];
        groundRadiance: [number, number, number];
    } | null;
    get extrusionLightState(): {
        dir: THREE.Vector3;
        color: THREE.Color;
        intensity: number;
        use3DLights: boolean;
    };
    private m_terrainMesh;
    private m_terrainController;
    get terrainController(): TerrainController | null;
    private m_backgroundQuad;
    private m_rasterQuad;
    private m_imageQuads;
    private m_colorThemeLut;
    constructor(m_mapView: MapView);
    setColorTheme(lut: import('./MBColorTheme').ColorThemeLut | null): void;
    private m_lightsColorThemeLut;
    setLightsColorTheme(lut: import('./MBColorTheme').ColorThemeLut | null): void;
    private themeLightColor;
    applyLights(lights: Light3DProperties[] | undefined, legacyLight?: any): void;
    private directionalVec;
    private static parseMBColor;
    applyFog(fog: FogSpec | undefined, styleZoom?: number): void;
    private m_fogState;
    private createFogAtmosphereDome;
    applySky(sky: SkySpec | undefined, fog: FogSpec | undefined): void;
    private createGradientSky;
    private createAtmosphereSky;
    private createStars;
    applyBackgroundPattern(patternName: string | undefined, spriteAtlas: SpriteAtlas | null, bgColor: string, bgOpacity: number, pitchAlignment?: string): Promise<void>;
    applyTerrain(terrain: {
        source: string;
        exaggeration?: number;
    } | undefined, demTileUrl: string | null, zoom?: number, center?: [number, number], demMaxZoom?: number, demTileSize?: number): Promise<void>;
    private clearLights;
    applyRasterSource(rasterTileUrl: string | null, zoom?: number, center?: [number, number], paint?: Record<string, any>, layer?: {
        visibility?: string;
        minzoom?: number;
        maxzoom?: number;
    }): Promise<void>;
    applyImageSources(style: any): Promise<void>;
    dispose(): void;
}
//# sourceMappingURL=MBEnvironmentManager.d.ts.map