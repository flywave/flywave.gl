import {
    DecodedTile,
    DecoderOptions,
    OptionsMap,
} from '@flywave/flywave-datasource-protocol';
import { Projection, TileKey } from '@flywave/flywave-geoutils';
import { ThemedTileDecoder } from '@flywave/flywave-mapview-decoder/index-worker';
import { OmvDataAdapter } from '@flywave/flywave-vectortile-datasource/adapters/omv/OmvDataAdapter';
import { DecodeInfo } from '@flywave/flywave-vectortile-datasource/DecodeInfo';
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from '@flywave/flywave-vectortile-datasource/IGeometryProcessor';
import * as THREE from 'three';
import { MBLayerEvaluator } from './MBLayerEvaluator';
import { MBTileDataEmitter } from './MBTileDataEmitter';
import { StyleSpecification } from './MBStyleSpec';

class MBStyleDataProcessor implements IGeometryProcessor {
    private m_emitter: MBTileDataEmitter | undefined;

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

    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector3[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            { type: 'Point', properties, id: featureId },
            this.m_zoom, 'point',
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
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            { type: 'LineString', properties, id: featureId },
            this.m_zoom, 'line',
        );
        if (matched.length === 0 || !this.m_emitter) return;
        this.m_emitter.processLineFeature(layer, extents, geometry, properties, featureId, matched);
    }

    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        const matched = this.m_layerEvaluator.evaluate(
            this.m_sourceId, layer,
            { type: 'Polygon', properties, id: featureId },
            this.m_zoom, 'polygon',
        );
        if (matched.length === 0 || !this.m_emitter) return;
        this.m_emitter.processFillFeature(layer, extents, geometry, properties, featureId, matched);
    }
}

export class MBStyleDecoder extends ThemedTileDecoder {
    private m_dataAdapter: OmvDataAdapter;
    private m_layerEvaluator: MBLayerEvaluator | undefined;
    private m_currentSourceId: string = '';

    constructor() {
        super();
        this.m_dataAdapter = new OmvDataAdapter();
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
    }

    /**
     * Override decodeTile to bypass m_styleSetEvaluator check.
     * Our decoder uses MBLayerEvaluator instead of StyleSetEvaluator.
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

        if (!(data instanceof ArrayBuffer || data instanceof Uint8Array)) {
            return { techniques: [], geometries: [] };
        }

        const buffer = data instanceof Uint8Array ? data.buffer : data;
        const decodeInfo = new DecodeInfo(projection, tileKey, this.m_storageLevelOffset);
        const emitter = new MBTileDataEmitter(tileKey, decodeInfo, zoom);

        const processor = new MBStyleDataProcessor(
            tileKey, decodeInfo,
            this.m_layerEvaluator,
            this.m_currentSourceId,
            zoom,
        );
        processor.setEmitter(emitter);

        try {
            this.m_dataAdapter.process(buffer as ArrayBuffer, decodeInfo, processor);
        } catch (e) {
            return { techniques: [], geometries: [] };
        }

        return emitter.getDecodedTile();
    }
}
