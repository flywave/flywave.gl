import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { TerrainController } from './TerrainController';
export declare class TerrainDepthOcclusion {
    private m_depthTarget;
    private m_depthTexture;
    private m_mapView;
    private m_terrain;
    private m_active;
    private m_width;
    private m_height;
    private m_consumerMaterials;
    private m_uniformName;
    constructor(mapView: MapView, terrain: TerrainController, uniformName?: string);
    get depthTexture(): THREE.DepthTexture | null;
    addConsumer(material: THREE.Material): void;
    start(): void;
    stop(): void;
    dispose(): void;
    private onResize;
    private ensureTarget;
    private injectUniform;
    private onWillRender;
}
//# sourceMappingURL=TerrainDepthOcclusion.d.ts.map