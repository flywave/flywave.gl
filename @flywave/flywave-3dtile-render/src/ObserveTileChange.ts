interface Tile {
    content: {
        uri: string;
    };
}

type NotifyCallback = (tile: Tile, active: boolean) => void;

export class Observe3DTileChange {
    private _watchIds: Set<string> = new Set();
    private _notifyCallback: NotifyCallback;

    /**
     * Creates an instance to observe 3D tile changes
     * @param notifyCallback Callback function to be invoked when tile changes occur
     */
    constructor(notifyCallback: NotifyCallback) {
        this._notifyCallback = notifyCallback;
    }

    /**
     * Notifies about a tile change if it hasn't been notified before
     * @param currentTile The tile that changed
     * @param active Whether the tile is active or not
     */
    private _notifyTile(currentTile: Tile, active: boolean): void {
        const uri = currentTile.content.uri;
        if (this._watchIds.has(uri)) {
            return;
        }
        this._watchIds.add(uri);
        this._notifyCallback(currentTile, active);
    }

    /**
     * Watches for tile changes and triggers notifications
     * @param currentTile The current tile that changed
     * @param activeTiles Array of all active tiles
     * @param active Whether the current tile is active or not
     */
    public watchTileChange(currentTile: Tile, activeTiles: Tile[], active: boolean): void {
        if (this._watchIds.size === 0) {
            // First time watching - notify about all active tiles
            activeTiles.forEach(tile => {
                this._notifyTile(tile, active);
            });
        }
        // Notify about the current tile change
        this._notifyTile(currentTile, active);
    }

    /**
     * Clears all watched tile URIs
     */
    public clearWatched(): void {
        this._watchIds.clear();
    }

    /**
     * Checks if a tile URI is being watched
     * @param uri The tile URI to check
     * @returns True if the URI is being watched
     */
    public isWatching(uri: string): boolean {
        return this._watchIds.has(uri);
    }
}
