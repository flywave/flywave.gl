import {
    DecodedTile,
    DecoderOptions,
    OptionsMap,
} from '@flywave/flywave-datasource-protocol';
import { Projection, TileKey } from '@flywave/flywave-geoutils';
import { ThemedTileDecoder } from '@flywave/flywave-mapview-decoder/index-worker';
import { OmvDataAdapter } from '@flywave/flywave-vectortile-datasource/adapters/omv/OmvDataAdapter';
import { GeoJsonDataAdapter } from '@flywave/flywave-vectortile-datasource/adapters/geojson/GeoJsonDataAdapter';
import { DecodeInfo } from '@flywave/flywave-vectortile-datasource/DecodeInfo';
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from '@flywave/flywave-vectortile-datasource/IGeometryProcessor';
import * as THREE from 'three';
import { MBLayerEvaluator } from './MBLayerEvaluator';
import { MBTileDataEmitter } from './MBTileDataEmitter';
import { StyleSpecification } from './MBStyleSpec';

class MBStyleDataProcessor implements IGeometryProcessor {
    private m_emitter: MBTileDataEmitter | undefined;
    private m_featureStates: Map<string | number, Record<string, any>> = new Map();

    constructor(
        private m_tileKey: TileKey,
        private m_decodeInfo: DecodeInfo,
        private m_layerEvaluator: MBLayerEvaluator,
        private m_sourceId: string,
        private m_zoom: number,
    ) {}

    setEmitter(emitter: MBTileDataEmitter) {
        this.m_emitter = emitter;
    }

    setFeatureStates(states: Map<string | number, Record<string, any>>) {
        this.m_featureStates = states;
    }

    private getFeatureState(featureId: string | number | undefined): Record<string, any> | undefined {
        if (featureId === undefined) return undefined;
        return this.m_featureStates.get(featureId);
    }

    private tileToLocalLngLat(px: number, py: number): [number, number] {
        const level = this.m_tileKey.level + Math.log2(4096);
        const scale = Math.pow(2, level);
        const tCol = this.m_tileKey.column;
        const tRow = this.m_tileKey.row;
        const n = Math.pow(2, this.m_tileKey.level);
        const lng = ((tCol + px / 4096) / n) * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tRow + py / 4096) / n)));
        const lat = latRad * 180 / Math.PI;
        return [lng, lat];
    }

    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector3[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        const coords = geometry.length > 0
            ? this.tileToLocalLngLat(geometry[0].x, geometry[0].y)
            : [0, 0];
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            { type: 'Point', properties, id: featureId, _geom: { type: 'Point', coordinates: coords } },
            this.m_zoom, 'point', this.getFeatureState(featureId),
        );
        if (matched.length === 0 || !this.m_emitter) return;
        this.m_emitter.processPointFeature(layer, extents, geometry, properties, featureId, matched);
    }

    processLineFeature(
        layer: string,
        extents: number,
        geometry: ILineGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        const coords = geometry.length > 0 && geometry[0].positions.length > 0
            ? this.tileToLocalLngLat(geometry[0].positions[0].x, geometry[0].positions[0].y)
            : [0, 0];
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            { type: 'LineString', properties, id: featureId, _geom: { type: 'Point', coordinates: coords } },
            this.m_zoom, 'line', this.getFeatureState(featureId),
        );
        if (matched.length === 0 || !this.m_emitter) return;

        const symbolLayers = matched.filter(l => l.type === 'symbol');
        const nonSymbolLayers = matched.filter(l => l.type !== 'symbol');

        if (nonSymbolLayers.length > 0) {
            this.m_emitter.processLineFeature(layer, extents, geometry, properties, featureId, nonSymbolLayers);
        }

        if (symbolLayers.length > 0 && geometry.length > 0 && geometry[0].positions.length > 1) {
            const linePts: THREE.Vector3[] = [];
            const positions = geometry[0].positions;
            const step = Math.max(1, Math.floor(positions.length / 20));
            for (let i = 0; i < positions.length; i += step) {
                linePts.push(new THREE.Vector3(positions[i].x, positions[i].y, 0));
            }
            if (linePts.length >= 2) {
                const midIdx = Math.floor(linePts.length / 2);
                const midPt = linePts[midIdx];
                this.m_emitter.processPointFeature(
                    layer, extents, [midPt],
                    { ...properties, _linePath: linePts.map(p => [p.x, p.y]) },
                    featureId, symbolLayers,
                );
            }
        }
    }

    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        const coords = geometry.length > 0 && geometry[0].rings.length > 0 && geometry[0].rings[0].length > 0
            ? this.tileToLocalLngLat(geometry[0].rings[0][0].x, geometry[0].rings[0][0].y)
            : [0, 0];
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            { type: 'Polygon', properties, id: featureId, _geom: { type: 'Point', coordinates: coords } },
            this.m_zoom, 'polygon', this.getFeatureState(featureId),
        );
        if (matched.length === 0 || !this.m_emitter) return;
        this.m_emitter.processFillFeature(layer, extents, geometry, properties, featureId, matched);
    }
}

export class MBStyleDecoder extends ThemedTileDecoder {
    private m_omvAdapter: OmvDataAdapter;
    private m_geoJsonAdapter: GeoJsonDataAdapter;
    private m_layerEvaluator: MBLayerEvaluator | undefined;
    private m_currentSourceId: string = '';
    private m_featureStates: Map<string | number, Record<string, any>> = new Map();

    constructor() {
        super();
        this.m_omvAdapter = new OmvDataAdapter();
        this.m_geoJsonAdapter = new GeoJsonDataAdapter();
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        super.configure(options, customOptions);
        if (customOptions?.mbStyle) {
            this.m_layerEvaluator = new MBLayerEvaluator(customOptions.mbStyle as StyleSpecification);
        }
        if (customOptions?.currentSourceId) {
            this.m_currentSourceId = customOptions.currentSourceId as string;
        }
        if (customOptions?.featureStates) {
            this.m_featureStates = customOptions.featureStates as Map<string | number, Record<string, any>>;
        }
    }

    /**
     * Override decodeTile to bypass m_styleSetEvaluator check.
     */
    decodeTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        projection: Projection
    ): Promise<DecodedTile | undefined> {
        if (!this.m_layerEvaluator) {
            return Promise.resolve(undefined);
        }
        return this.decodeThemedTile(data, tileKey, undefined as any, projection);
    }

    async decodeThemedTile(
        data: any,
        tileKey: TileKey,
        _styleSetEvaluator: any,
        projection: Projection
    ): Promise<DecodedTile> {
        if (!this.m_layerEvaluator) {
            return { techniques: [], geometries: [] };
        }

        const zoom = Math.max(0, tileKey.level - this.m_storageLevelOffset);
        const decodeInfo = new DecodeInfo(projection, tileKey, this.m_storageLevelOffset);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, zoom);

        const processor = new MBStyleDataProcessor(
            tileKey, decodeInfo,
            this.m_layerEvaluator,
            this.m_currentSourceId,
            zoom,
        );
        processor.setEmitter(emitter);
        processor.setFeatureStates(this.m_featureStates);

        try {
            // Determine data format and use appropriate adapter
            if (typeof data === 'string') {
                // GeoJSON string from GeoJSONDataProvider
                const geoJson = JSON.parse(data);
                if (this.m_geoJsonAdapter.canProcess(geoJson)) {
                    this.m_geoJsonAdapter.process(geoJson, decodeInfo, processor);
                }
            } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                // GeoJSON object directly
                if (this.m_geoJsonAdapter.canProcess(data)) {
                    this.m_geoJsonAdapter.process(data, decodeInfo, processor);
                }
            } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                // MVT binary data
                const buffer = data instanceof Uint8Array ? data.buffer : data;
                this.m_omvAdapter.process(buffer as ArrayBuffer, decodeInfo, processor);
            }
        } catch (e) {
            return { techniques: [], geometries: [] };
        }

        return emitter.getDecodedTile();
    }
}
