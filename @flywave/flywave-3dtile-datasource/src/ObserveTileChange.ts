/* Copyright (C) 2025 flywave.gl contributors */

import { MathUtils } from "three";
import { ITile } from "./base/Tile";

export type NotifyCallback = (tile: ITile, active: boolean) => void;
export { ITile };

export class Observe3DTileChange {

    protected observeId: string = MathUtils.generateUUID();
    
    private readonly _watchIds = new Set<string>();
    private _notifyCallback: NotifyCallback;
    private activeTiles = new Set<ITile>();

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
    private _notifyTile(currentTile: ITile, active: boolean): void {
        const uri = `${currentTile.__basePath}/${currentTile.content.uri}`;
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
    public watchTileChange(currentTile: ITile, activeTiles: Set<ITile>, active: boolean): void {
        if (this._watchIds.size === 0) {
            // First time watching - notify about all active tiles
            activeTiles.forEach(tile => {
                this._notifyTile(tile, active);
            });
        }

        this.activeTiles = activeTiles;
        // Notify about the current tile change
        this._notifyTile(currentTile, active);
    }

    protected nodifyActiveTiles(): void {
        this._watchIds.clear();
        this.activeTiles.forEach(tile => {
            this._notifyTile(tile, true);
        });
    }

    public dispose(): void {
        this._watchIds.clear();
        this._notifyCallback = null;
    }
}
