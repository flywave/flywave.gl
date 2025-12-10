/* Copyright (C) 2025 flywave.gl contributors */

import { type Tile, BaseTileLoader, TileLoaderState } from "@flywave/flywave-mapview";
import { addGroundPlane } from "@flywave/flywave-mapview/geometry/AddGroundPlane";
import { enableBlending } from "@flywave/flywave-materials";
import * as THREE from "three";

import { type WebTileDataProvider, type WebTileDataSource } from "./WebTileDataSource";

/**
 * TileLoader used by `WebTileDataSource`.
 */
export class WebTileLoader extends BaseTileLoader {
    /**
     * Set up loading of a single [[Tile]].
     *
     * @param dataSource - The [[DataSource]] the tile belongs to.
     * @param tileKey - The quadtree address of a [[Tile]].
     * @param dataProvider - The [[DataProvider]] that retrieves the binary tile data.
     */
    constructor(
        protected dataSource: WebTileDataSource,
        private readonly tile: Tile,
        private readonly dataProvider: WebTileDataProvider
    ) {
        super(dataSource, tile.tileKey);
    }

    /**
     * @override
     */
    protected loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        this.dataProvider
            .getTexture(this.tile, abortSignal)
            .then(value => {
                if (value === undefined || value[0] === undefined) {
                    this.tile.forceHasGeometry(true);
                    onDone(TileLoaderState.Ready);
                    return;
                }

                const [texture, copyrightInfo] = value;
                if (copyrightInfo !== undefined) {
                    this.tile.copyrightInfo = copyrightInfo;
                }

                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;
                // This is required because the WebTileDataSource uses the default setting of
                // useGeometryLoader on the DataSource, so it has to clear the tile's objects
                // manually.
                this.tile.clear();
                this.tile.addOwnedTexture(texture);
                const planeMesh = addGroundPlane(
                    this.tile,
                    this.dataSource.renderOrder,
                    0xffffff,
                    this.dataSource.opacity,
                    true
                );
                const planeMaterial = planeMesh.material as THREE.MeshBasicMaterial;
                planeMaterial.map = texture;
                if (this.dataSource.transparent) {
                    enableBlending(planeMaterial);
                }
                // planeMaterial.depthTest = false;

                this.tile.invalidateResourceInfo();
                this.dataSource.requestUpdate();
                onDone(TileLoaderState.Ready);
            }, onError)
            .catch(onError);
    }
}
