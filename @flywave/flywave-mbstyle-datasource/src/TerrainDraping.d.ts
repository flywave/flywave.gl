import { MapView } from '@flywave/flywave-mapview';
import { TerrainController } from './TerrainController';
export declare class TerrainDraping {
    private m_mapView;
    private m_terrain;
    private m_renderTargets;
    private m_needsBake;
    private m_active;
    private m_bakeSize;
    private m_wasMorphing;
    private m_extraBakeFrames;
    private static readonly CLEAR_COLOR;
    private static readonly MAX_EXTRA_BAKES;
    constructor(mapView: MapView, terrain: TerrainController, bakeSize?: number);
    requestBake(): void;
    start(): void;
    stop(): void;
    dispose(): void;
    get isActive(): boolean;
    get bakeSize(): number;
    private onAfterRender;
    private m_lastMeshCount;
    private bakeAll;
    private isEnvironmentObject;
}
//# sourceMappingURL=TerrainDraping.d.ts.map