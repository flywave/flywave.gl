import * as THREE from 'three';
export declare class MapTerrainMaterial extends THREE.MeshStandardMaterial {
    private m_demTexture;
    private m_demPrevTexture;
    private m_demLerp;
    private m_demIsFloat;
    private m_exaggeration;
    private m_drapeTexture;
    constructor();
    setDemTexture(texture: THREE.Texture | null): void;
    setDemPrevTexture(texture: THREE.Texture | null): void;
    setDemLerp(lerp: number): void;
    setDemIsFloat(isFloat: boolean): void;
    setDrapeTexture(texture: THREE.Texture | null): void;
    setExaggeration(exaggeration: number): void;
    private m_zSecLat;
    setZSecLat(secLat: number): void;
    dispose(): void;
}
export declare function decodeTerrainElevation(r: number, g: number, b: number): number;
export declare function createTerrainGrid(width?: number, height?: number, segments?: number): THREE.BufferGeometry;
//# sourceMappingURL=MapTerrainMaterial.d.ts.map