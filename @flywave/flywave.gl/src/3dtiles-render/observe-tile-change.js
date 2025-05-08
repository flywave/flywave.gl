export class Observe3DTileChange {
    _watchIds = new Set();

    constructor(nodifyCallBack) {
        this._nodifyCallBack = nodifyCallBack;
    }

    _nodifyTile(currentTile, active) {
        if (this._watchIds.has(currentTile.content.uri)) {
            return;
        }
        this._watchIds.add(currentTile.content.uri);
        this._nodifyCallBack(currentTile, active);
    }

    _watchTileChange(currentTile, activeTiles, active) {
        if (this._watchIds.size == 0) {
            activeTiles.forEach(tile => {
                this._nodifyTile(tile, active);
            });
        }
        this._nodifyTile(currentTile, active);
    }
}
