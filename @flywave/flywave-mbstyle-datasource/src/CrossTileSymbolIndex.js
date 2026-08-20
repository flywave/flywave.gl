"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossTileSymbolIndex = void 0;
exports.symbolKey = symbolKey;
function symbolKey(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    }
    return (h >>> 0) & 0xffff;
}
const ROUNDING_FACTOR = 1 / 32;
const MATCH_TOLERANCE = 1;
class CrossTileSymbolIndex {
    constructor() {
        this.m_maxCrossTileID = 0;
        this.m_layerIndexes = new Map();
    }
    generateID() {
        return ++this.m_maxCrossTileID;
    }
    assignIDs(layerId, symbols) {
        const result = new Map();
        if (!this.m_layerIndexes.has(layerId)) {
            this.m_layerIndexes.set(layerId, new Map());
        }
        const zoomIndexes = this.m_layerIndexes.get(layerId);
        const zoom = symbols.length > 0 ? Math.round(symbols[0].zoom) : 0;
        if (!zoomIndexes.has(zoom)) {
            zoomIndexes.set(zoom, new Map());
        }
        const usedIDs = new Set();
        const newEntriesByTile = new Map();
        for (const sym of symbols) {
            const key = symbolKey(sym.text);
            const qx = Math.round(sym.screenX * ROUNDING_FACTOR);
            const qy = Math.round(sym.screenY * ROUNDING_FACTOR);
            let matchedID = 0;
            for (const [otherZoom, tileMap] of zoomIndexes) {
                const dz = otherZoom - zoom;
                const tol = dz < 0 ? MATCH_TOLERANCE : Math.pow(2, dz) | 0 || MATCH_TOLERANCE;
                for (const idx of tileMap.values()) {
                    for (const cand of idx.symbols) {
                        if (cand.key !== key)
                            continue;
                        if (usedIDs.has(cand.crossTileID))
                            continue;
                        if (Math.abs(cand.x - qx) > tol || Math.abs(cand.y - qy) > tol)
                            continue;
                        matchedID = cand.crossTileID;
                        usedIDs.add(matchedID);
                        break;
                    }
                    if (matchedID)
                        break;
                }
                if (matchedID)
                    break;
            }
            if (!matchedID) {
                matchedID = this.generateID();
                usedIDs.add(matchedID);
            }
            result.set(sym.localId, matchedID);
            const entry = { crossTileID: matchedID, key, x: qx, y: qy };
            const arr = newEntriesByTile.get(sym.tileKey);
            if (arr)
                arr.push(entry);
            else
                newEntriesByTile.set(sym.tileKey, [entry]);
        }
        const tileMap = zoomIndexes.get(zoom);
        for (const [tileKey, entries] of newEntriesByTile) {
            tileMap.set(tileKey, { tileKey, symbols: entries });
        }
        return result;
    }
    pruneStale(layerId, currentTileKeys) {
        let removed = 0;
        const zoomIndexes = this.m_layerIndexes.get(layerId);
        if (!zoomIndexes)
            return 0;
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
    removeLayer(layerId) {
        this.m_layerIndexes.delete(layerId);
    }
    get size() {
        let n = 0;
        for (const zoomMap of this.m_layerIndexes.values()) {
            for (const tileMap of zoomMap.values()) {
                for (const idx of tileMap.values())
                    n += idx.symbols.length;
            }
        }
        return n;
    }
}
exports.CrossTileSymbolIndex = CrossTileSymbolIndex;
//# sourceMappingURL=CrossTileSymbolIndex.js.map