export class Observe3DTileChange {
    _watchIds = new Set();

    constructor(nodifyCallBack) {
        this._nodifyCallBack = nodifyCallBack;
    }

    _nodifyTile(currentTile) {
        if (this._watchIds.has(currentTile.content.uri)) {
            return;
        }
        this._watchIds.add(currentTile.content.uri);
        this._nodifyCallBack(currentTile);
    }

    _watchTileChange(currentTile, activeTiles) {
        if (this._watchIds.size == 0) {
            activeTiles.forEach(tile => {
                this._nodifyTile(tile);
            });
        }
        this._nodifyTile(currentTile);
    }
}
