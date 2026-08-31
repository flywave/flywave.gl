// §668: world-copy text/POI gate.
//
// The engine's text pipeline projects TextElements without the per-tile
// world offset, so label sets built for world-copy tiles (tile.offset ±1)
// stack onto the primary copy — the extent/1024-symbol triple-label smear.
// mgl draws world copies off-canvas at these views, so skipping text/POI
// construction for offset≠0 tiles reproduces mgl's visible outcome.
// Idempotent prototype wraps on the engine's PoiManager and
// TileGeometryCreator.

export function installWorldCopyTextGate(): void {
    const g = globalThis as any;
    if (g.__mbWorldCopyTextGateInstalled) return;
    g.__mbWorldCopyTextGateInstalled = true;

    Promise.all([
        import('@flywave/flywave-mapview/src/poi/PoiManager'),
        import('@flywave/flywave-mapview/src/geometry/TileGeometryCreator'),
    ])
        .then(([poiMod, geoMod]) => {
            const poiProto = poiMod.PoiManager?.prototype as any;
            if (poiProto?.addPois && !poiProto.__mbOffsetGated) {
                poiProto.__mbOffsetGated = true;
                const origPois = poiProto.addPois;
                poiProto.addPois = function (tile: any, decodedTile: any) {
                    if ((tile?.offset ?? 0) !== 0) return;
                    origPois.call(this, tile, decodedTile);
                };
            }
            const geoProto = geoMod.TileGeometryCreator?.prototype as any;
            if (geoProto?.createTextElements && !geoProto.__mbOffsetGated) {
                geoProto.__mbOffsetGated = true;
                const origText = geoProto.createTextElements;
                geoProto.createTextElements = function (tile: any, decodedTile: any, filter: any) {
                    if ((tile?.offset ?? 0) !== 0) return;
                    origText.call(this, tile, decodedTile, filter);
                };
            }
        })
        .catch(() => { /* best-effort */ });
}
