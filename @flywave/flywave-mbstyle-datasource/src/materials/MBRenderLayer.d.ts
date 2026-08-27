import * as THREE from 'three';
import { DecodedTile, IndexedTechnique } from '@flywave/flywave-datasource-protocol';
import { Tile } from '@flywave/flywave-mapview';
interface RenderableObject {
    object: THREE.Object3D;
    layerId: string;
    renderOrder: number;
    technique: IndexedTechnique;
}
export declare class MBRenderLayer {
    private m_materialCache;
    private m_spriteAtlas;
    private m_demTileUrl;
    setSpriteAtlas(atlas: any): void;
    setDemTileUrl(url: string | null): void;
    buildObjects(tile: Tile, decodedTile: DecodedTile): RenderableObject[];
    private buildFromGeometry;
    clearCache(): void;
    private loadDemTexture;
    private applyAnchor;
    private buildTextMesh;
    private getMaterialKey;
    private bufferToTypedArray;
}
export {};
//# sourceMappingURL=MBRenderLayer.d.ts.map