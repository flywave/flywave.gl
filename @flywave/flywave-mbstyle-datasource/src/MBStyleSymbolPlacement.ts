import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { PlacementEngine, SymbolInstance } from './PlacementEngine';
import { MBStyleDataSource } from './MBStyleDataSource';

/**
 * Per-frame symbol placement controller for MBStyleDataSource.
 *
 * Collects all symbol objects (icons + text) from decoded tiles,
 * projects their world positions to screen space,
 * runs collision detection via PlacementEngine,
 * and sets object.visible accordingly.
 *
 * Usage:
 *   const placement = new MBStyleSymbolPlacement(mapView, dataSource);
 *   mapView.addEventListener('AfterRender', () => placement.run());
 */
export class MBStyleSymbolPlacement {
    private m_placementEngine = new PlacementEngine();
    private m_lastZoom = -1;

    constructor(
        private m_mapView: MapView,
        private m_dataSource: MBStyleDataSource,
    ) {}

    /**
     * Run symbol placement for the current frame.
     * Call this once per frame (e.g., in AfterRender event).
     */
    run(): void {
        const zoom = this.m_mapView.zoomLevel;
        const camera = this.m_mapView.camera;
        const canvas = this.m_mapView.canvas;
        const w = canvas.width;
        const h = canvas.height;
        const bearing = (this.m_mapView as any).heading ?? 0;

        // Collect all symbol objects
        const symbols = this.collectSymbols(camera, w, h);
        if (symbols.length === 0) return;

        // Apply icon-rotation-alignment
        this.applyRotationAlignment(symbols, bearing);

        // Only re-run placement if zoom changed (optimization)
        if (zoom !== this.m_lastZoom) {
            this.m_lastZoom = zoom;
            const results = this.m_placementEngine.place(symbols, Date.now());

            for (const sym of symbols) {
                const key = `${sym.layerId}:${sym.featureId}`;
                const result = results.get(key);
                if (result && sym.object) {
                    sym.object.visible = result.visible;
                }
            }
        }
    }

    /**
     * Apply icon-rotation-alignment: 'map' rotates with bearing, 'viewport' stays upright.
     */
    private applyRotationAlignment(symbols: SymbolInstance[], bearing: number): void {
        for (const sym of symbols) {
            if (!sym.object) continue;

            const obj = sym.object as THREE.Object3D;
            // Check technique for rotation-alignment
            const tech = obj.userData?.technique;
            if (!tech) continue;

            const layout = tech._layout ?? {};
            const alignment = layout['icon-rotation-alignment'] ?? 'auto';
            const placement = layout['symbol-placement'] ?? 'point';

            // For point placement: 'auto' = viewport, 'map' = rotate with bearing
            // For line placement: 'auto' = map, 'viewport' = upright
            const isMapAligned =
                alignment === 'map' ||
                (alignment === 'auto' && placement === 'line');

            if (isMapAligned && (obj as any).isSprite) {
                const bearingRad = -bearing * Math.PI / 180;
                const mat = (obj as any).material;
                if (mat) {
                    mat.rotation = (tech._paint?.['icon-rotate'] ?? 0) * Math.PI / 180 + bearingRad;
                }
            }
        }
    }

    private collectSymbols(camera: THREE.Camera, canvasW: number, canvasH: number): SymbolInstance[] {
        const symbols: SymbolInstance[] = [];
        const worldPosition = new THREE.Vector3();

        // Iterate all tiles from the datasource
        const ds = this.m_dataSource as any;
        const tileDataSources = ds.m_mapView?.m_tileDataSources as any[];
        if (!tileDataSources) return symbols;

        for (const ds2 of tileDataSources) {
            if (ds2 !== this.m_dataSource) continue;

            // Access tiles through the tile visitor
            const tiles = ds2.m_tiles as Map<any, any> | undefined;
            if (!tiles) continue;

            for (const tile of tiles.values()) {
                if (!tile.objects) continue;

                for (const obj of tile.objects) {
                    if (!obj.userData?.technique) continue;
                    const tech = obj.userData.technique;

                    // Only process symbol objects
                    if (tech.name !== 'text' && tech.name !== 'labeled-icon') continue;

                    // Get world position
                    obj.getWorldPosition(worldPosition);

                    // Project to screen
                    const screen = worldPosition.clone().project(camera);
                    const sx = (screen.x * 0.5 + 0.5) * canvasW;
                    const sy = (-screen.y * 0.5 + 0.5) * canvasH;

                    // Get feature properties
                    const feature = obj.userData.feature;
                    const featureId = feature?.objInfos?.[0]?.$id ?? obj.id ?? '';

                    // Estimate icon/text box size
                    const layout = tech._layout ?? {};
                    const paint = tech._paint ?? {};
                    const textSize = layout['text-size'] ?? 16;
                    const iconSize = layout['icon-size'] ?? 1;

                    let iconBox: { w: number; h: number } | undefined;
                    let textBox: { w: number; h: number } | undefined;

                    if (tech.name === 'labeled-icon') {
                        iconBox = { w: 32 * iconSize, h: 32 * iconSize };
                    }
                    if (tech.name === 'text' || layout['text-field']) {
                        const textWidth = tech._textWidth ?? textSize * 5;
                        const textHeight = tech._textHeight ?? textSize * 1.2;
                        textBox = { w: textWidth * textSize, h: textHeight * textSize };
                    }

                    symbols.push({
                        id: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}:${featureId}`,
                        layerId: tech._layerId ?? '',
                        featureId,
                        screenX: sx,
                        screenY: sy,
                        iconBox,
                        textBox,
                        allowOverlap: layout['icon-allow-overlap'] === true || layout['text-allow-overlap'] === true,
                        ignorePlacement: layout['icon-ignore-placement'] === true || layout['text-ignore-placement'] === true,
                        priority: tech._renderOrder ?? 0,
                        opacity: 1,
                        object: obj,
                    });
                }
            }
        }

        return symbols;
    }

    /**
     * Force re-placement on next run (e.g., after style change).
     */
    invalidate(): void {
        this.m_lastZoom = -1;
    }
}
