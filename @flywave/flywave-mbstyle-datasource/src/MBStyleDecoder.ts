import {
    DecodedTile,
    DecoderOptions,
    OptionsMap,
} from '@flywave/flywave-datasource-protocol';
import { Projection, TileKey } from '@flywave/flywave-geoutils';
import { ThemedTileDecoder } from '@flywave/flywave-mapview-decoder/index-worker';
import { OmvDataAdapter } from '@flywave/flywave-vectortile-datasource/adapters/omv/OmvDataAdapter';
import { MapEnv } from '@flywave/flywave-datasource-protocol/index-decoder';

import { MBLayerEvaluator, EvaluatedLayer } from './MBLayerEvaluator';
import { MBTileDataEmitter } from './MBTileDataEmitter';
import { StyleSpecification } from './MBStyleSpec';

export class MBStyleDecoder extends ThemedTileDecoder {
    private m_layerEvaluator: MBLayerEvaluator | undefined;
    private m_dataAdapter: OmvDataAdapter;
    private m_style: StyleSpecification | undefined;

    constructor() {
        super();
        this.m_dataAdapter = new OmvDataAdapter();
    }

    setStyle(style: StyleSpecification): void {
        this.m_style = style;
        this.m_layerEvaluator = new MBLayerEvaluator(style);
    }

    connect(): Promise<void> {
        return Promise.resolve();
    }

    async decodeThemedTile(
        data: any,
        tileKey: TileKey,
        _styleSetEvaluator: any,
        projection: Projection
    ): Promise<DecodedTile> {
        if (!this.m_layerEvaluator || !this.m_style) {
            return { techniques: [], geometries: [] };
        }

        const currentSourceId = (this as any).m_currentSourceId ?? '';
        const zoom = Math.max(0, tileKey.level - this.m_storageLevelOffset);

        const emitter = new MBTileDataEmitter(tileKey, projection, zoom);

        this.m_dataAdapter.process(data, {} as any, {
            processPointFeature: (
                layer: string,
                extents: number,
                geometry: any[],
                properties: any,
                featureId: any
            ) => {
                const matchedLayers = this.m_layerEvaluator!.evaluate(
                    currentSourceId,
                    layer,
                    { type: 'Point', properties, id: featureId },
                    zoom,
                    'point'
                );
                if (matchedLayers.length === 0) return;
                emitter.processPointFeature(layer, extents, geometry, properties, featureId, matchedLayers);
            },
            processLineFeature: (
                layer: string,
                extents: number,
                geometry: any[],
                properties: any,
                featureId: any
            ) => {
                const matchedLayers = this.m_layerEvaluator!.evaluate(
                    currentSourceId,
                    layer,
                    { type: 'LineString', properties, id: featureId },
                    zoom,
                    'line'
                );
                if (matchedLayers.length === 0) return;
                emitter.processLineFeature(layer, extents, geometry, properties, featureId, matchedLayers);
            },
            processPolygonFeature: (
                layer: string,
                extents: number,
                geometry: any[],
                properties: any,
                featureId: any
            ) => {
                const matchedLayers = this.m_layerEvaluator!.evaluate(
                    currentSourceId,
                    layer,
                    { type: 'Polygon', properties, id: featureId },
                    zoom,
                    'polygon'
                );
                if (matchedLayers.length === 0) return;
                emitter.processFillFeature(layer, extents, geometry, properties, featureId, matchedLayers);
            },
        });

        return emitter.getDecodedTile();
    }

    configure(options?: DecoderOptions, customOptions?: OptionsMap): void {
        super.configure(options, customOptions);
        if (customOptions?.mbStyle) {
            this.setStyle(customOptions.mbStyle as StyleSpecification);
        }
        if (customOptions?.currentSourceId) {
            (this as any).m_currentSourceId = customOptions.currentSourceId;
        }
    }
}
