/* Copyright (C) 2025 flywave.gl contributors */

import { type TilingScheme, TileKey } from "@flywave/flywave-geoutils";
import { type CopyrightInfo, type Tile, TileTaskGroups } from "@flywave/flywave-mapview";
import { TileObjectRenderer } from "@flywave/flywave-mapview/TileObjectsRenderer";
import {
    type OmvWithRestClientParams,
    VectorTileDataSource
} from "@flywave/flywave-vectortile-datasource";
import * as THREE from "three";

import { WebTileDataProvider } from "./WebTileDataSource";

export class VectorTileRendererProvider extends WebTileDataProvider {
    private readonly _vectorSource: VectorTileDataSource;
    private readonly _scene: THREE.Scene = new THREE.Scene();
    private readonly _rootNode: THREE.Object3D = new THREE.Object3D();
    private _renderer?: TileObjectRenderer;
    private _mapView: any;
    private readonly _textureResolution: number;

    constructor(options: OmvWithRestClientParams & { textureResolution?: number } = {}) {
        super(options);
        
        this._vectorSource = new VectorTileDataSource({});
        this._scene.add(this._rootNode);
        this._textureResolution = options.textureResolution || 1024;
    }

    /**
     * Initialize the renderer with a map view
     * @param mapView The MapView instance to attach to
     */
    async connect(mapView: any): Promise<void> {
        this._mapView = mapView;
        this._vectorSource.attach(mapView);

        // Clone lights from map view
        mapView.lights.forEach((light: THREE.Light) => {
            this._scene.add(light.clone());
        });

        await this._vectorSource.connect();
        await this._vectorSource.setTheme(mapView.theme);

        this._renderer = new TileObjectRenderer(mapView.env, mapView.renderer);
        this._renderer.setupRenderer();
    }

    /**
     * Implementation of WebTileDataProvider interface
     * @param tile The tile to render
     * @returns Promise resolving to the texture and copyright info
     */
    async getTexture(
        tile: Tile,
        abortSignal?: AbortSignal
    ): Promise<[THREE.Texture, CopyrightInfo[]]> {
        const tileKey = tile.tileKey;

        // Load vector tile data
        const vectorTile = this._vectorSource.getTile(tileKey, false);
        await vectorTile.tileLoader.waitSettled();
        await vectorTile.tileGeometryLoader.update();
        await vectorTile.tileGeometryLoader.waitFinished();

        // Render to texture
        const texture = await this._renderTileToTexture(vectorTile);
        return [texture, []];
    }

    /**
     * Renders a tile to a texture
     * @param tile The tile to render
     * @returns Promise resolving to the rendered texture
     */
    private async _renderTileToTexture(tile: Tile): Promise<THREE.Texture> {
        return await new Promise(resolve => {
            this._mapView.taskQueue.add({
                execute: () => {
                    const texture = this._renderFrameBuffer(tile);
                    resolve(texture);
                },
                group: TileTaskGroups.CREATE,
                getPriority: () => 9,
                isExpired: () => tile.disposed,
                estimatedProcessTime: () => (tile.decodedTile?.decodeTime ?? 30) / 6
            });
        });
    }

    /**
     * Performs the actual rendering of a tile to a texture
     * @param tile The tile to render
     * @returns The rendered texture
     */
    private _renderFrameBuffer(tile: Tile): THREE.Texture {
        if (!this._renderer) {
            throw new Error("Renderer not initialized");
        }

        this._rootNode.clear();
        this._renderer.prepareRender();

        // Create camera for this tile
        const mbox = this._vectorSource.projection.projectBox(tile.geoBox, new THREE.Box3());
        const { x, y } = mbox.getSize(new THREE.Vector3());
        const camera = new THREE.OrthographicCamera(-x / 2, x / 2, y / 2, -y / 2, 1, 1000);
        mbox.getCenter(camera.position);
        camera.position.z = 500;

        // Render tile contents
        this._renderer.render(
            tile,
            tile.tileKey.level,
            tile.tileKey.level,
            camera.position,
            this._rootNode
        );

        // If nothing to render, return empty texture
        if (this._rootNode.children.length === 0) {
            return new THREE.Texture();
        }

        // Set up render target
        const renderTarget = new THREE.WebGLRenderTarget(
            this._textureResolution,
            this._textureResolution,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType
            }
        );

        // Perform the render
        const { renderer } = this._mapView;
        const oldRenderTarget = renderer.getRenderTarget();
        const oldClearAlpha = renderer.getClearAlpha();

        camera.position.set(0, 0, 0);
        renderer.setRenderTarget(renderTarget);
        renderer.setClearAlpha(0);
        renderer.clear();
        renderer.render(this._scene, camera);
        renderer.setRenderTarget(oldRenderTarget);
        renderer.setClearAlpha(oldClearAlpha);

        return renderTarget.texture;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this._rootNode.clear();
        this._vectorSource.dispose();
    }

    /**
     * Get the tiling scheme used by this renderer
     */
    get tilingScheme(): TilingScheme {
        return this._vectorSource.getTilingScheme();
    }
}
