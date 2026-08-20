import * as THREE from 'three';
export declare function decodeDemImage(image: HTMLImageElement | ImageBitmap, encoding?: 'mapbox' | 'terrarium'): THREE.DataTexture;
export declare function createSkirtedGrid(size: number, segments: number, skirtHeight: number): THREE.BufferGeometry;
export declare class TerrainController {
    private m_meshes;
    private m_demTextures;
    private m_scene;
    private m_gridGeometry;
    private m_centerDem;
    private m_morphActive;
    private m_morphStart;
    private m_prevDemTextures;
    private static readonly MORPH_DURATION;
    constructor(scene: THREE.Scene);
    get meshCount(): number;
    get meshes(): readonly THREE.Mesh[];
    get centerDem(): {
        texture: THREE.Texture;
        originX: number;
        originY: number;
        size: number;
    } | null;
    get allDemTiles(): Array<{
        texture: THREE.Texture;
        originX: number;
        originY: number;
        size: number;
    }>;
    updateMorphing(now: number): boolean;
    get isMorphing(): boolean;
    setWireframe(enabled: boolean): void;
    build(demTileUrl: string, zoom: number, center: [number, number], exaggeration: number, radius?: number): Promise<void>;
    private loadAndAddTile;
    dispose(): void;
}
//# sourceMappingURL=TerrainController.d.ts.map