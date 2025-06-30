import { TileKey } from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";

export class TerrainDataProvider extends DataProvider {
    private readonly fetchTile: (tileKey: TileKey) => Promise<any>;

    constructor(fetchTile: (tileKey: TileKey) => Promise<any>) {
        super();
        if (fetchTile === undefined) {
            throw new Error('"fetchTile()" method was not provided');
        }
        this.fetchTile = fetchTile;
    }

    dispose(): void {}

    connect(): Promise<void> {
        return Promise.resolve();
    }

    ready(): boolean {
        return true;
    }

    getTile(tileKey: TileKey): Promise<any> {
        return this.fetchTile(tileKey);
    }
}
