/**
 * CrossTileSymbolIndex — assigns stable crossTileIDs to symbols so that the
 * same conceptual label (same text + nearby position) keeps one identity across
 * tiles and zoom levels. This is the foundation for continuous fade opacity:
 * without it, a label's identity changes every frame and opacity cannot persist.
 *
 * Reference: mapbox-gl-js src/symbol/cross_tile_symbol_index.ts
 *
 * v1 simplification: linear-scan matching instead of KDBush (fine for the
 * symbol counts in render tests); matches across adjacent zoom levels only.
 */

/** Compute a 16-bit content hash for a label's text (djb2 variant). */
export function symbolKey(text: string): number {
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    }
    return (h >>> 0) & 0xffff;
}

interface IndexedSymbol {
    crossTileID: number;
    key: number;
    /** Quantized anchor in a global ~4px grid (mapbox roundingFactor = 1/32). */
    x: number;
    y: number;
}

interface TileLayerIndex {
    tileKey: string;
    symbols: IndexedSymbol[];
}

/**
 * Rounding factor for cross-tile position matching.
 * mapbox: 512 / EXTENT / 2 (= 1/32). Positions are quantized to a ~4px grid so
 * that the same label in slightly different tile coordinates still matches.
 */
const ROUNDING_FACTOR = 1 / 32;

/** Tolerance (in quantized grid units) for spatial matching. */
const MATCH_TOLERANCE = 1;

export class CrossTileSymbolIndex {
    private m_maxCrossTileID = 0;
    /** layerId -> zoom -> tileKey -> symbols */
    private m_layerIndexes: Map<string, Map<number, Map<string, TileLayerIndex>>> = new Map();

    private generateID(): number {
        return ++this.m_maxCrossTileID;
    }

    /**
     * Assign crossTileIDs to a batch of symbols belonging to one layer/tile.
     * Returns a map from the input symbol's local id -> crossTileID.
     *
     * `symbols` should carry: a stable local id, the resolved text, the quantized
     * anchor (x,y already multiplied by ROUNDING_FACTOR), the tileKey and zoom.
     */
    assignIDs(
        layerId: string,
        symbols: Array<{
            localId: string;
            text: string;
            screenX: number;
            screenY: number;
            tileKey: string;
            zoom: number;
        }>,
    ): Map<string, number> {
        const result = new Map<string, number>();

        if (!this.m_layerIndexes.has(layerId)) {
            this.m_layerIndexes.set(layerId, new Map());
        }
        const zoomIndexes = this.m_layerIndexes.get(layerId)!;

        const zoom = symbols.length > 0 ? Math.round(symbols[0].zoom) : 0;
        if (!zoomIndexes.has(zoom)) {
            zoomIndexes.set(zoom, new Map());
        }
        // Per-call dedup set: prevents multiple symbols in THIS batch from
        // claiming the same parent ID (mapbox issue #5993). Not persisted — the
        // same parent ID may be inherited by adjacent tiles for fade continuity.
        const usedIDs = new Set<number>();

        const newEntriesByTile = new Map<string, IndexedSymbol[]>();

        for (const sym of symbols) {
            const key = symbolKey(sym.text);
            const qx = Math.round(sym.screenX * ROUNDING_FACTOR);
            const qy = Math.round(sym.screenY * ROUNDING_FACTOR);

            let matchedID = 0;
            // Search across all known zoom levels for a match.
            for (const [otherZoom, tileMap] of zoomIndexes) {
                const dz = otherZoom - zoom;
                // Tolerance grows when matching against coarser (parent) tiles.
                const tol = dz < 0 ? MATCH_TOLERANCE : Math.pow(2, dz) | 0 || MATCH_TOLERANCE;
                for (const idx of tileMap.values()) {
                    for (const cand of idx.symbols) {
                        if (cand.key !== key) continue;
                        if (usedIDs.has(cand.crossTileID)) continue;
                        if (Math.abs(cand.x - qx) > tol || Math.abs(cand.y - qy) > tol) continue;
                        matchedID = cand.crossTileID;
                        usedIDs.add(matchedID);
                        break;
                    }
                    if (matchedID) break;
                }
                if (matchedID) break;
            }

            if (!matchedID) {
                matchedID = this.generateID();
                usedIDs.add(matchedID);
            }

            result.set(sym.localId, matchedID);
            const entry: IndexedSymbol = { crossTileID: matchedID, key, x: qx, y: qy };
            const arr = newEntriesByTile.get(sym.tileKey);
            if (arr) arr.push(entry); else newEntriesByTile.set(sym.tileKey, [entry]);
        }

        // Register each tile's symbols (a batch may span multiple tiles).
        const tileMap = zoomIndexes.get(zoom)!;
        for (const [tileKey, entries] of newEntriesByTile) {
            tileMap.set(tileKey, { tileKey, symbols: entries });
        }

        return result;
    }

    /**
     * Remove tiles that are no longer visible. `currentTileKeys` is the set of
     * tileKeys still present at each zoom for the given layer.
     */
    pruneStale(layerId: string, currentTileKeys: Set<string>): number {
        let removed = 0;
        const zoomIndexes = this.m_layerIndexes.get(layerId);
        if (!zoomIndexes) return 0;
        for (const [zoom, tileMap] of zoomIndexes) {
            for (const [tileKey, idx] of tileMap) {
                if (!currentTileKeys.has(tileKey)) {
                    tileMap.delete(tileKey);
                    removed++;
                }
            }
            if (tileMap.size === 0) {
                zoomIndexes.delete(zoom);
            }
        }
        return removed;
    }

    /** Remove an entire layer's index (layer deleted from style). */
    removeLayer(layerId: string): void {
        this.m_layerIndexes.delete(layerId);
    }

    /** Total symbols indexed (diagnostic). */
    get size(): number {
        let n = 0;
        for (const zoomMap of this.m_layerIndexes.values()) {
            for (const tileMap of zoomMap.values()) {
                for (const idx of tileMap.values()) n += idx.symbols.length;
            }
        }
        return n;
    }
}
