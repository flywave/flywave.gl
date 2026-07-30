import {
    FlatTheme,
    Theme,
} from '@flywave/flywave-datasource-protocol';
import { TileKey, webMercatorTilingScheme, sphereProjection, mercatorProjection, ProjectionType } from '@flywave/flywave-geoutils';
import { Tile } from '@flywave/flywave-mapview';
import { MapViewEventNames } from '@flywave/flywave-mapview';
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
import { MBEnvironmentManager } from './MBEnvironmentManager';
import { MBMaterialPatchManager } from './MBMaterialPatchManager';

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
 * DataProvider that generates synthetic GeoJSON polygon features for each tile,
 * carrying the raster tile image URL. The emitter creates a fill technique,
 * and the MaterialPatchManager loads the raster texture per-tile.
 */
class RasterTileDataProvider extends DataProvider {
    private m_tileUrlTemplate: string;

    constructor(tileUrlTemplate: string) {
        super();
        this.m_tileUrlTemplate = tileUrlTemplate;
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;

        const n = Math.pow(2, z);
        const lngW = (x / n) * 360 - 180;
        const lngE = ((x + 1) / n) * 360 - 180;
        const latN = this.tile2lat(y, z);
        const latS = this.tile2lat(y + 1, z);

        const rasterUrl = this.m_tileUrlTemplate
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));

        const geojson = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [lngW, latN],
                        [lngE, latN],
                        [lngE, latS],
                        [lngW, latS],
                        [lngW, latN],
                    ]],
                },
                properties: {
                    _rasterTileUrl: rasterUrl,
                    _tileCol: x,
                    _tileRow: y,
                    _tileZoom: z,
                },
            }],
        };

        return JSON.stringify(geojson);
    }

    private tile2lat(y: number, z: number): number {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * DataProvider for hillshade layers. Generates a tile-covering polygon per tile
 * carrying the resolved raster-DEM tile url, so the emitter can emit a fill
 * technique flagged as hillshade and the MaterialPatchManager can load the DEM
 * and apply the hillshade shader.
 */
class HillshadeTileDataProvider extends DataProvider {
    private m_demUrlTemplate: string;

    constructor(demUrlTemplate: string) {
        super();
        this.m_demUrlTemplate = demUrlTemplate;
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;

        const n = Math.pow(2, z);
        const lngW = (x / n) * 360 - 180;
        const lngE = ((x + 1) / n) * 360 - 180;
        const latN = this.tile2lat(y, z);
        const latS = this.tile2lat(y + 1, z);

        const demUrl = this.m_demUrlTemplate
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));

        const geojson = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [lngW, latN],
                        [lngE, latN],
                        [lngE, latS],
                        [lngW, latS],
                        [lngW, latN],
                    ]],
                },
                properties: {
                    _hillshadeDemUrl: demUrl,
                    _tileCol: x,
                    _tileRow: y,
                    _tileZoom: z,
                },
            }],
        };

        return JSON.stringify(geojson);
    }

    private tile2lat(y: number, z: number): number {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}
class GeoJSONDataProvider extends DataProvider {
    private m_geoJsonData: string;
    private m_cluster: boolean = false;
    private m_clusterRadius: number = 50;
    private m_clusterMaxZoom: number = 16;
    private m_clusteredCache: Map<number, string> = new Map();

    constructor(data: any, clusterOpts?: { cluster?: boolean; clusterRadius?: number; clusterMaxZoom?: number }) {
        super();
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        if (clusterOpts) {
            this.m_cluster = clusterOpts.cluster ?? false;
            this.m_clusterRadius = clusterOpts.clusterRadius ?? 50;
            this.m_clusterMaxZoom = clusterOpts.clusterMaxZoom ?? 16;
        }
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        if (!this.m_cluster) return this.m_geoJsonData;
        const zoom = tileKey.level;
        if (zoom >= this.m_clusterMaxZoom) return this.m_geoJsonData;
        const roundedZoom = Math.floor(zoom / 2) * 2;
        if (!this.m_clusteredCache.has(roundedZoom)) {
            const clustered = this.clusterAtZoom(roundedZoom);
            this.m_clusteredCache.set(roundedZoom, clustered);
        }
        return this.m_clusteredCache.get(roundedZoom)!;
    }

    private clusterAtZoom(zoom: number): string {
        try {
            const geo = JSON.parse(this.m_geoJsonData);
            const features = geo.features ?? [];
            const points = features.filter((f: any) => f.geometry?.type === 'Point');
            const nonPoints = features.filter((f: any) => f.geometry?.type !== 'Point');
            if (points.length === 0) return this.m_geoJsonData;

            const gridSize = this.m_clusterRadius * 2;
            const grid = new Map<string, any[]>();
            for (const pt of points) {
                const [lng, lat] = pt.geometry.coordinates;
                const cx = Math.floor(((lng + 180) / 360) * gridSize * Math.pow(2, zoom));
                const cy = Math.floor(((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * gridSize * Math.pow(2, zoom));
                const key = `${cx}:${cy}`;
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key)!.push(pt);
            }

            const clusteredFeatures: any[] = [];
            for (const [, group] of grid) {
                if (group.length === 1) {
                    clusteredFeatures.push(group[0]);
                } else {
                    let sumLng = 0, sumLat = 0;
                    for (const f of group) {
                        sumLng += f.geometry.coordinates[0];
                        sumLat += f.geometry.coordinates[1];
                    }
                    clusteredFeatures.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [sumLng / group.length, sumLat / group.length] },
                        properties: { cluster: true, cluster_id: `${zoom}:${group.length}`, point_count: group.length },
                    });
                }
            }

            return JSON.stringify({
                ...geo,
                features: [...nonPoints, ...clusteredFeatures],
            });
        } catch {
            return this.m_geoJsonData;
        }
    }

    updateData(data: any): void {
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        this.m_clusteredCache.clear();
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
    private m_demTileUrl: string | null = null;
    private m_rasterTileUrl: string | null = null;
    private m_environment: MBEnvironmentManager | null = null;
    private m_materialPatcher: MBMaterialPatchManager | null = null;

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
        await this.m_styleManager.loadStyle(this.m_styleParams.style, this.m_styleParams.accessToken);
        const style = this.m_styleManager.getStyle();
        if (!style) {
            throw new Error('Failed to load Mapbox Style');
        }

        // Apply background color from background layers
        this.applyBackgroundColor(style);

        // Apply projection (globe/mercator/etc.)
        this.applyProjection(style);

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

        // Priority 1: Find best vector tile source (most layers referencing it)
        let found = false;
        const layerCounts = new Map<string, number>();
        for (const layer of style.layers ?? []) {
            const src = (layer as any).source as string;
            if (src) layerCounts.set(src, (layerCounts.get(src) ?? 0) + 1);
        }

        let bestVectorSourceId: string | null = null;
        let bestVectorCount = 0;
        for (const [sourceId, source] of sources) {
            if (source.type === 'vector') {
                const count = layerCounts.get(sourceId) ?? 0;
                if (count > bestVectorCount || bestVectorSourceId === null) {
                    bestVectorSourceId = sourceId;
                    bestVectorCount = count;
                    const resolved = source;
                }
            }
        }

        if (bestVectorSourceId) {
            const source = sources.get(bestVectorSourceId)!;
            const restClient = this.createOmvRestClient(
                source,
                this.m_styleParams.accessToken
            );
            this.m_delegatingProvider.delegate = restClient;
            this.m_currentSourceId = bestVectorSourceId;

            await this.decoder.configure(undefined, {
                mbStyle: style,
                currentSourceId: bestVectorSourceId,
            } as any);

            found = true;
        }

        // Priority 2: Find best GeoJSON source (most layers referencing it)
        if (!found) {
            let bestGeoSourceId: string | null = null;
            let bestGeoCount = 0;
            for (const [sourceId, source] of sources) {
                if (source.type === 'geojson') {
                    const count = layerCounts.get(sourceId) ?? 0;
                    if (count > bestGeoCount || bestGeoSourceId === null) {
                        bestGeoSourceId = sourceId;
                        bestGeoCount = count;
                    }
                }
            }

            if (bestGeoSourceId) {
                const sourceId = bestGeoSourceId;
                const geoJsonSpec = (style.sources as any)[sourceId] as GeoJSONSourceSpec;
                let data: any = geoJsonSpec.data;
                if (typeof data === 'string' && data.trim() !== '') {
                    try {
                        const url = data.replace(/^local:\/\//, '/base/mapbox-gl-js/test/integration/');
                        const resp = await fetch(url);
                        data = await resp.json();
                    } catch (e) {
                    }
                }
                if (data) {
                    this.m_delegatingProvider.delegate = new GeoJSONDataProvider(data, {
                        cluster: geoJsonSpec.cluster,
                        clusterRadius: geoJsonSpec.clusterRadius,
                        clusterMaxZoom: geoJsonSpec.clusterMaxZoom,
                    });
                    this.m_currentSourceId = sourceId;

                    await this.decoder.configure(undefined, {
                        mbStyle: style,
                        currentSourceId: sourceId,
                    } as any);

                    found = true;
                }
            }
        }

        if (!found) {
            // No data sources found — style may only have background layers
        }

        for (const [sourceId, source] of sources) {
            if (source.type === 'raster-dem') {
                const demSpec = (style.sources as any)[sourceId];
                const tiles = demSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? '';
                if (tileUrl) {
                    this.m_demTileUrl = tileUrl.replace(/^local:\/\//, '/base/mapbox-gl-js/test/integration/');
                }
                break;
            }
        }

        for (const [sourceId, source] of sources) {
            if (source.type === 'raster' && !found) {
                const rasterSpec = (style.sources as any)[sourceId];
                const tiles = rasterSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? '';
                if (tileUrl) {
                    const resolvedUrl = tileUrl.replace(/^local:\/\//, '/base/mapbox-gl-js/test/integration/');
                    this.m_delegatingProvider.delegate = new RasterTileDataProvider(resolvedUrl);
                    this.m_currentSourceId = sourceId;
                    this.m_rasterTileUrl = resolvedUrl;
                    await this.decoder.configure(undefined, {
                        mbStyle: style,
                        currentSourceId: sourceId,
                        demTileUrl: this.m_demTileUrl,
                        rasterTileUrl: resolvedUrl,
                    } as any);
                    found = true;
                    break;
                }
            }
        }

        // Hillshade: if the style has a hillshade layer referencing a raster-dem
        // source, set up a tile provider that emits tile-covering polygons carrying
        // the per-tile DEM url. The emitter turns these into fill+_isHillshade
        // techniques; the MaterialPatchManager loads the DEM and applies the shader.
        if (!found) {
            const hasHillshade = (style.layers ?? []).some(
                (l: any) => l.type === 'hillshade' && (l.layout?.visibility ?? 'visible') === 'visible',
            );
            if (hasHillshade && this.m_demTileUrl) {
                this.m_delegatingProvider.delegate = new HillshadeTileDataProvider(this.m_demTileUrl);
                const hillshadeLayer = (style.layers ?? []).find(
                    (l: any) => l.type === 'hillshade',
                ) as any;
                const hillshadeSourceId: string = hillshadeLayer?.source ?? 'hillshade-dem';
                this.m_currentSourceId = hillshadeSourceId;
                await this.decoder.configure(undefined, {
                    mbStyle: style,
                    currentSourceId: hillshadeSourceId,
                    demTileUrl: this.m_demTileUrl,
                } as any);
                found = true;
            }
        }

        await this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: this.m_currentSourceId,
            demTileUrl: this.m_demTileUrl,
        } as any);

        // Load sprite atlas if style has a sprite URL
        if (style.sprite) {
            await this.loadSpriteAtlas(style.sprite);
        }

        if (this.mapView) {
            this.m_environment = new MBEnvironmentManager(this.mapView);
            this.m_environment.applyLights(
                (style as any).lights as any,
                style.light,
            );
            this.m_environment.applyFog(style.fog);
            this.m_environment.applySky(style.sky, style.fog);

            const bgLayer = (style.layers ?? []).find((l: any) => l.type === 'background');
            if (bgLayer) {
                const bgPaint = (bgLayer as any).paint ?? {};
                const pattern = bgPaint['background-pattern'];
                if (pattern && this.m_spriteAtlas) {
                    await this.m_environment.applyBackgroundPattern(
                        pattern,
                        this.m_spriteAtlas,
                        bgPaint['background-color'] ?? '#000000',
                        bgPaint['background-opacity'] ?? 1,
                    );
                }
            }

            this.m_materialPatcher = new MBMaterialPatchManager(this);
            this.m_materialPatcher.invalidate();
            const patcher = this.m_materialPatcher;
            this.mapView.addEventListener(MapViewEventNames.AfterRender, () => {
                patcher.patchTileMaterials();
            });
        }

        await this.loadModels(style);

        if (this.m_environment && style.terrain) {
            await this.m_environment.applyTerrain(
                style.terrain as any,
                this.m_demTileUrl,
                style.zoom ?? 8,
                style.center ?? [0, 0],
            );
        }

        if (this.m_environment && this.m_rasterTileUrl) {
            const rasterLayer = (style.layers ?? []).find((l: any) => l.type === 'raster');
            const rasterPaint = (rasterLayer as any)?.paint ?? {};
            await this.m_environment.applyRasterSource(
                this.m_rasterTileUrl,
                Math.min(Math.max(Math.floor(style.zoom ?? 0), 0), 12),
                style.center ?? [0, 0],
                rasterPaint,
            );
        }

        if (this.m_environment) {
            await this.m_environment.applyImageSources(style);
        }

        await super.connect();
    }

    get spriteAtlas(): SpriteAtlas | null {
        return this.m_spriteAtlas;
    }

    get demTileUrl(): string | null {
        return this.m_demTileUrl;
    }

    get rasterTileUrl(): string | null {
        return this.m_rasterTileUrl;
    }

    private async loadModels(style: StyleSpecification): Promise<void> {
        const modelLayers = (style.layers ?? []).filter(
            (l: any) => l.type === 'model' && (l.layout?.visibility ?? 'visible') === 'visible',
        );
        if (modelLayers.length === 0) return;

        const scene = (this.mapView as any)?.m_scene as THREE.Scene | undefined;
        if (!scene) return;

        for (const layer of modelLayers) {
            const sourceId = (layer as any).source;
            if (!sourceId) continue;
            const source = (style.sources as any)[sourceId];
            if (!source) continue;

            const modelUrl = typeof source.data === 'string'
                ? source.data.replace(/^local:\/\//, '/base/mapbox-gl-js/test/integration/')
                : source.url?.replace(/^local:\/\//, '/base/mapbox-gl-js/test/integration/') ?? '';

            if (!modelUrl) continue;

            const modelPositions = (layer as any).layout?.['model-position'];
            const positionList = Array.isArray(modelPositions) && modelPositions.length > 0 && Array.isArray(modelPositions[0])
                ? modelPositions
                : (style.center ? [style.center] : [[0, 0]]);
            const modelScale = (layer as any).layout?.['model-scale'] ?? 1;

            try {
                const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
                const loader = new GLTFLoader();
                const gltf = await loader.loadAsync(modelUrl);

                for (const pos of positionList) {
                    const model = gltf.scene.clone(true);
                    const lng = pos[0];
                    const lat = pos[1];
                    const z = pos[2] ?? 0;

                    const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                    const geoCoord = new GeoCoordinates(lat, lng);
                    const projection = (this.mapView as any).projection;
                    if (projection) {
                        const worldPos = projection.projectPoint(geoCoord);
                        model.position.set(worldPos.x, worldPos.y, (worldPos as any).z ?? z);
                    }
                    model.scale.setScalar(modelScale);
                    scene.add(model);
                }
            } catch {}
        }
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
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        this.requestUpdate();

        if (!(this as any).m_featureStates) {
            (this as any).m_featureStates = new Map();
        }
        (this as any).m_featureStates.set(featureId, state);

        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: (this as any).m_featureStates,
        } as any);
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
     * Apply projection from style — switches MapView between mercator and globe.
     *
     * Uses flywave's native projection system:
     * - `mercator` (default) → `mercatorProjection` (flat planar world)
     * - `globe` → `sphereProjection` (ECEF sphere, native globe rendering)
     *
     * When switching to globe, the entire native pipeline activates automatically:
     * tiles are positioned on sphere surface, camera constraints adjust for curvature,
     * atmosphere/horizon rendering activates, label placement filters near horizon.
     *
     * For mercator↔globe transition (Mapbox zoom 5→6 smoothstep), flywave uses a
     * hard switch (no interpolation). A smooth morph would require a custom
     * interpolating Projection subclass (future enhancement).
     */
    private applyProjection(style: StyleSpecification): void {
        if (!this.mapView) return;
        const styleProj = (style as any).projection;
        const projName = typeof styleProj === 'string' ? styleProj : styleProj?.name;
        const projConfig = { name: projName ?? 'mercator', center: styleProj?.center, parallels: styleProj?.parallels };

        if (projConfig.name !== 'mercator' && projConfig.name !== 'globe') {
            try {
                const { MBMapProjection } = require('./MBMapProjection');
                const customProj = new MBMapProjection(projConfig);
                (this.mapView as any).projection = customProj;
                return;
            } catch {}
        }

        if (projConfig.name === 'globe') {
            (this.mapView as any).projection = sphereProjection;
        } else {
            const currentType = this.mapView.projection?.type;
            if (currentType === ProjectionType.Spherical) {
                (this.mapView as any).projection = mercatorProjection;
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
