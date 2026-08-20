import { DecodedTile, DecoderOptions, OptionsMap } from '@flywave/flywave-datasource-protocol';
import { Projection, TileKey } from '@flywave/flywave-geoutils';
import { ThemedTileDecoder } from '@flywave/flywave-mapview-decoder/index-worker';
export declare class MBStyleDecoder extends ThemedTileDecoder {
    private m_omvAdapter;
    private m_geoJsonAdapter;
    private m_layerEvaluator;
    private m_currentSourceId;
    private m_featureStates;
    private m_pitch;
    private m_brightness;
    private m_clipMask;
    private m_worldview;
    private m_center;
    private m_bearing;
    private m_mapboxZoom;
    private m_glyphMetrics;
    constructor();
    connect(): Promise<void>;
    configure(options?: DecoderOptions, customOptions?: OptionsMap): void;
    private buildGlyphLookup;
    decodeTile(data: ArrayBufferLike | {}, tileKey: TileKey, projection: Projection): Promise<DecodedTile | undefined>;
    decodeThemedTile(data: any, tileKey: TileKey, _styleSetEvaluator: any, projection: Projection): Promise<DecodedTile>;
    private static normalizeGeoJson;
}
//# sourceMappingURL=MBStyleDecoder.d.ts.map