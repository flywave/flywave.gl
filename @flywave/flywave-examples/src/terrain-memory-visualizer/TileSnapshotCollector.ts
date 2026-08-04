import type {
    TileSnapshot,
    TileEvent,
    CameraInfo,
    SnapshotResult,
    TileKeyLike,
    GeoBoxLike
} from "./types";

export class TileSnapshotCollector {
    private prevTiles = new Map<string, { snapshot: TileSnapshot; geoBox: GeoBoxLike }>();
    private frameNumber = 0;

    constructor(private mapView: unknown) {}

    collect(): SnapshotResult {
        const mv = this.mapView as Record<string, unknown>;
        const frame = this.frameNumber++;
        const tiles = new Map<string, TileSnapshot>();
        const events: TileEvent[] = [];

        const terrainSource = this.findTerrainSource();
        const lruTiles = this.getLRUTiles(terrainSource);
        const visibleTileKeys = this.getVisibleTileKeys();
        const camera = this.getCameraInfo();

        let totalCached = 0;
        let withMesh = 0;
        let visible = 0;

        for (const tile of lruTiles) {
            const tileKey = this.getTileKey(tile);
            if (!tileKey || !tileKey.level) continue;

            const geoBox = this.getTileGeoBox(tile);
            if (!geoBox) continue;

            const mortonId = tileKey.mortonCode
                ? tileKey.mortonCode()
                : `${tileKey.level}/${tileKey.row}/${tileKey.column}`;
            const hasMesh = !!this.getCachedMesh(tile);
            const isVisible = visibleTileKeys.has(mortonId);
            const isUsed = !!(tile as { _isUsed?: boolean })._isUsed;
            const bytes = this.getTileBytes(tile);

            const snapshot: TileSnapshot = {
                tileKey,
                geoBox,
                hasMesh,
                isVisible,
                isUsed,
                bytes,
                mortonId
            };

            tiles.set(mortonId, snapshot);
            totalCached++;

            if (hasMesh) withMesh++;
            if (isVisible) visible++;

            const prev = this.prevTiles.get(mortonId);
            if (!prev) {
                events.push({
                    frame,
                    type: "create",
                    tileKey,
                    geoBox,
                    bytes
                });
            }
        }

        let evictedThisFrame = 0;
        for (const [mortonId, prev] of this.prevTiles) {
            if (!tiles.has(mortonId)) {
                evictedThisFrame++;
                events.push({
                    frame,
                    type: "evict",
                    tileKey: prev.snapshot.tileKey,
                    geoBox: prev.geoBox,
                    bytes: prev.snapshot.bytes
                });
            }
        }

        const createdThisFrame = events.filter(e => e.type === "create").length;

        this.prevTiles.clear();
        for (const [id, snap] of tiles) {
            this.prevTiles.set(id, { snapshot: snap, geoBox: snap.geoBox });
        }

        return {
            tiles,
            events,
            camera,
            stats: {
                totalCached,
                withMesh,
                visible,
                evictedThisFrame,
                createdThisFrame
            }
        };
    }

    private findTerrainSource(): unknown | null {
        const mv = this.mapView as { dataSources?: unknown[]; getElevationSource?: () => unknown };
        if (mv.getElevationSource) {
            const src = mv.getElevationSource();
            if (src) return src;
        }
        if (mv.dataSources) {
            for (const ds of mv.dataSources) {
                if (ds && typeof ds === "object" && "m_tileCache" in ds) {
                    return ds;
                }
            }
        }
        return null;
    }

    private getLRUTiles(source: unknown): unknown[] {
        if (!source) return [];
        const src = source as {
            m_tileCache?: { getAllTiles?: () => unknown[]; _tileMap?: Map<string, unknown> };
        };
        const cache = src.m_tileCache;
        if (!cache) return [];
        if (cache.getAllTiles) return cache.getAllTiles();
        if (cache._tileMap) return Array.from(cache._tileMap.values());
        return [];
    }

    private getVisibleTileKeys(): Set<string> {
        const result = new Set<string>();
        const mv = this.mapView as { visibleTileSet?: { dataSourceTileList?: unknown[] } };
        const vts = mv.visibleTileSet;
        if (!vts || !vts.dataSourceTileList) return result;

        for (const entry of vts.dataSourceTileList) {
            const e = entry as { visibleTiles?: unknown[]; renderedTiles?: Set<unknown> };
            const tiles = e.visibleTiles || [];
            for (const tile of tiles) {
                const t = tile as {
                    tileKey?: TileKeyLike;
                    dataSource?: { getTilingScheme?: () => { mortonTileEncoding?: unknown } };
                };
                if (t.tileKey) {
                    const encoding = t.dataSource?.getTilingScheme?.()?.mortonTileEncoding;
                    const morton = t.tileKey.mortonCode
                        ? t.tileKey.mortonCode(encoding)
                        : `${t.tileKey.level}/${t.tileKey.row}/${t.tileKey.column}`;
                    result.add(morton);
                }
            }
        }
        return result;
    }

    private getTileKey(tile: unknown): TileKeyLike | null {
        const t = tile as { tileKey?: TileKeyLike };
        return t.tileKey || null;
    }

    private getTileGeoBox(tile: unknown): GeoBoxLike | null {
        const t = tile as { geoBox?: GeoBoxLike };
        if (t.geoBox) return t.geoBox;
        return null;
    }

    private getCachedMesh(tile: unknown): unknown {
        const t = tile as { cachedMesh?: unknown };
        return t.cachedMesh ?? null;
    }

    private getTileBytes(tile: unknown): number {
        const t = tile as { resourceManager?: { getMemoryUsed?: () => number } };
        return t.resourceManager?.getMemoryUsed?.() ?? 0;
    }

    private getCameraInfo(): CameraInfo {
        const mv = this.mapView as {
            camera: { position: { x: number; y: number; z: number } };
            target?: { latitude: number; longitude: number; altitude: number };
            heading?: number;
            tilt?: number;
            zoomLevel?: number;
        };
        const cam = mv.camera;
        const target = mv.target;

        const corners: { lat: number; lng: number }[] = [];

        return {
            latitude: target?.latitude ?? 0,
            longitude: target?.longitude ?? 0,
            altitude: target?.altitude ?? 0,
            heading: mv.heading ?? 0,
            tilt: mv.tilt ?? 0,
            frustumCorners: corners
        };
    }

    reset() {
        this.prevTiles.clear();
        this.frameNumber = 0;
    }
}
