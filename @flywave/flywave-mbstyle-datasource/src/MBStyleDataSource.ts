import {
    FlatTheme,
    Theme,
} from '@flywave/flywave-datasource-protocol';
import { TileKey, webMercatorTilingScheme } from '@flywave/flywave-geoutils';
import { Tile } from '@flywave/flywave-mapview';
import {
    DataProvider,
    TileDataSource,
    TileDataSourceOptions,
    TileFactory,
} from '@flywave/flywave-mapview-decoder';
import {
    APIFormat,
    OmvRestClient,
    OmvRestClientParameters,
} from '@flywave/flywave-vectortile-datasource/OmvRestClient';
import * as THREE from 'three';

import { MBStyleManager, ResolvedSource } from './MBStyleManager';
import { GeoJSONSourceSpec, StyleSpecification } from './MBStyleSpec';
import { SpriteAtlas } from './materials/MapIconMaterial';
import { MBStyleRuntime } from './MBStyleRuntime';

export interface MBStyleDataSourceParameters {
    style: StyleSpecification | string;
    accessToken?: string;
    decoderScriptUrl?: string;
    concurrentDecoderServiceName?: string;
    storageLevelOffset?: number;
    minDisplayLevel?: number;
    maxDisplayLevel?: number;
}

const MBSTYLE_DECODER_SERVICE_TYPE = 'mbstyle-vector-tile-decoder';

/**
 * DataProvider that serves inline GeoJSON data for all tile requests.
 * Used when a Mapbox style source has type "geojson" with inline data.
 */
class GeoJSONDataProvider extends DataProvider {
    private m_geoJsonData: string;

    constructor(data: any) {
        super();
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
    }

    ready(): boolean { return true; }

    async getTile(_tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        // Return the same GeoJSON for every tile request.
        // The decoder will process it with GeoJsonDataAdapter.
        return this.m_geoJsonData;
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

class DelegatingDataProvider extends DataProvider {
    delegate: DataProvider | null = null;

    ready(): boolean {
        return this.delegate?.ready() ?? true;
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        if (!this.delegate) return new ArrayBuffer(0);
        return this.delegate.getTile(tileKey, abortSignal);
    }

    protected async connect(): Promise<void> {
        if (this.delegate) {
            try {
                await (this.delegate as any).connect();
            } catch (e) {
                // Silently pass
            }
        }
    }

    protected dispose(): void {
        this.delegate = null;
    }
}

export class MBStyleDataSource extends TileDataSource {
    private m_styleManager: MBStyleManager;
    private m_styleParams: MBStyleDataSourceParameters;
    private m_delegatingProvider: DelegatingDataProvider;
    private m_spriteAtlas: SpriteAtlas | null = null;
    private m_runtime: MBStyleRuntime | null = null;
    private m_currentSourceId: string = '';

    constructor(params: MBStyleDataSourceParameters) {
        const delegatingProvider = new DelegatingDataProvider();

        const options: TileDataSourceOptions = {
            tilingScheme: webMercatorTilingScheme,
            dataProvider: delegatingProvider,
            concurrentDecoderServiceName:
                params.concurrentDecoderServiceName ?? MBSTYLE_DECODER_SERVICE_TYPE,
            concurrentDecoderScriptUrl: params.decoderScriptUrl,
            minDataLevel: 1,
            maxDataLevel: 22,
            storageLevelOffset: params.storageLevelOffset ?? -1,
        };

        super(new TileFactory(Tile), options);

        this.m_delegatingProvider = delegatingProvider;
        this.m_styleManager = new MBStyleManager();
        this.m_styleParams = params;
        this.cacheable = true;
        this.addGroundPlane = false;
    }

    get styleManager(): MBStyleManager {
        return this.m_styleManager;
    }

    private createOmvRestClient(
        source: ResolvedSource,
        accessToken?: string
    ): OmvRestClient {
        const url = source.tileUrls[0] ?? '';
        const params: OmvRestClientParameters = {
            url,
            apiFormat: APIFormat.XYZMVT,
        };
        if (accessToken) {
            params.authenticationCode = accessToken;
        }
        return new OmvRestClient(params);
    }

    async connect(): Promise<void> {
        await this.m_styleManager.loadStyle(this.m_styleParams.style);
        const style = this.m_styleManager.getStyle();
        if (!style) {
            throw new Error('Failed to load Mapbox Style');
        }

        // Apply background color from background layers
        this.applyBackgroundColor(style);

        // Apply camera settings from style
        this.applyCameraSettings(style);

        // Create runtime styling API
        this.m_runtime = new MBStyleRuntime(style, () => {
            // On style change: reconfigure decoder and mark tiles dirty
            this.decoder.configure(undefined, {
                mbStyle: this.m_runtime!.style,
                currentSourceId: this.m_currentSourceId,
            } as any);
            if (this.mapView) {
                this.mapView.markTilesDirty(this);
            }
        });

        const sources = this.m_styleManager.getResolvedSources();

        // Priority 1: Find first vector tile source
        let found = false;
        for (const [sourceId, source] of sources) {
            if (source.type === 'vector') {
                const restClient = this.createOmvRestClient(
                    source,
                    this.m_styleParams.accessToken
                );
                this.m_delegatingProvider.delegate = restClient;
                this.m_currentSourceId = sourceId;

                await this.decoder.configure(undefined, {
                    mbStyle: style,
                    currentSourceId: sourceId,
                } as any);

                found = true;
                break;
            }
        }

        // Priority 2: Find first GeoJSON source
        if (!found) {
            for (const [sourceId, source] of sources) {
                if (source.type === 'geojson') {
                    const geoJsonSpec = (style.sources as any)[sourceId] as GeoJSONSourceSpec;
                    const data = geoJsonSpec.data;
                    if (data) {
                        this.m_delegatingProvider.delegate = new GeoJSONDataProvider(data);
                        this.m_currentSourceId = sourceId;

                        await this.decoder.configure(undefined, {
                            mbStyle: style,
                            currentSourceId: sourceId,
                        } as any);

                        found = true;
                        break;
                    }
                }
            }
        }

        if (!found) {
            // No data sources found — style may only have background layers
        }

        // Load sprite atlas if style has a sprite URL
        if (style.sprite) {
            await this.loadSpriteAtlas(style.sprite);
        }

        await super.connect();
    }

    get spriteAtlas(): SpriteAtlas | null {
        return this.m_spriteAtlas;
    }

    /**
     * Runtime styling API for dynamic style manipulation.
     * Usage: dataSource.runtime.setPaintProperty('water', 'fill-color', '#0000ff')
     */
    get runtime(): MBStyleRuntime | null {
        return this.m_runtime;
    }

    private async loadSpriteAtlas(spriteUrl: string): Promise<void> {
        const spriteData = await this.m_styleManager.loadSprite(spriteUrl);
        if (spriteData) {
            const icons = new Map<string, any>();
            for (const [name, info] of Object.entries(spriteData.json)) {
                icons.set(name, info);
            }
            this.m_spriteAtlas = new SpriteAtlas(spriteData.image, icons);
        }
    }

    async setTheme(_theme: Theme | FlatTheme): Promise<void> {
    }

    /**
     * Override setFeatureState to trigger tile re-decode when feature state changes.
     * The base class stores feature state; we additionally mark tiles dirty
     * so the decoder re-evaluates expressions with updated state.
     */
    setFeatureState(featureId: number | string, state: any): void {
        super.setFeatureState(featureId, state);
        // Mark all tiles dirty to trigger re-decode with updated feature state
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        // Invalidate symbol placement
        this.requestUpdate();
    }

    override removeFeatureState(featureId: number | string): void {
        super.removeFeatureState(featureId);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
    }

    shouldPreloadTiles(): boolean {
        return true;
    }

    getDataZoomLevel(zoomLevel: number): number {
        return Math.max(
            this.minDataLevel,
            Math.min(this.maxDataLevel, zoomLevel + this.storageLevelOffset)
        );
    }

    /**
     * Apply background color from style's background layers to MapView clear color.
     */
    private applyBackgroundColor(style: StyleSpecification): void {
        for (const layer of style.layers ?? []) {
            if (layer.type === 'background') {
                const paint = (layer as any).paint ?? {};
                const color = paint['background-color'];
                const opacity = paint['background-opacity'] ?? 1;
                if (color && this.mapView) {
                    // Convert hex color string to number for MapView.clearColor
                    const c = new THREE.Color(color);
                    (this.mapView as any).clearColor = c.getHex();
                    if (opacity < 1) {
                        (this.mapView as any).clearAlpha = opacity;
                    }
                }
                break;
            }
        }
    }

    /**
     * Apply camera settings (center, zoom, bearing, pitch) from the style.
     */
    private applyCameraSettings(style: StyleSpecification): void {
        if (!this.mapView) return;

        const center = style.center;
        const zoom = style.zoom;
        const bearing = style.bearing ?? 0;
        const pitch = style.pitch ?? 0;

        if (center && typeof zoom === 'number') {
            // Import GeoCoordinates dynamically to avoid circular dependency issues
            const { GeoCoordinates } = require('@flywave/flywave-geoutils');
            const geoCoord = new GeoCoordinates(center[1], center[0]);
            this.mapView.setCameraGeolocationAndZoom(geoCoord, zoom, bearing, pitch);
        }
    }
}
