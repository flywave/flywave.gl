import { Tile } from "../base/Tile";
import { Observe3DTileChange } from "../ObserveTileChange";

export class ThemeObserve3DTileChange extends Observe3DTileChange {
    constructor() {
        super((tile: Tile, active: boolean) => {
            if (active) {
                this.onTileWatched(tile, active);
            }
        });
    }

    protected onTileWatched(tile: Tile, active: boolean) {}
}
