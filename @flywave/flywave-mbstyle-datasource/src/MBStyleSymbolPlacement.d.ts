import { MapView } from '@flywave/flywave-mapview';
import { MBStyleDataSource } from './MBStyleDataSource';
export declare class MBStyleSymbolPlacement {
    private m_mapView;
    private m_dataSource;
    private m_placementEngine;
    private m_crossTileIndex;
    private m_lastZoom;
    private m_collisionDebug;
    private m_debugOverlay;
    constructor(m_mapView: MapView, m_dataSource: MBStyleDataSource);
    setCollisionDebug(enabled: boolean): void;
    run(): void;
    private drawCollisionDebug;
    private applyRotationAlignment;
    private collectSymbols;
    private assignCrossTileIDs;
    private applyZOrder;
    private applyOffsets;
    invalidate(): void;
}
//# sourceMappingURL=MBStyleSymbolPlacement.d.ts.map