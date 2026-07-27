import {
    DecoderOptions,
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
import { VECTOR_TILE_DECODER_SERVICE_TYPE } from '@flywave/flywave-vectortile-datasource/OmvDecoderDefs';
import { LoggerManager } from '@flywave/flywave-utils';

import { MBStyleManager, ResolvedSource } from './MBStyleManager';
import { StyleSpecification } from './MBStyleSpec';

const logger = LoggerManager.instance.create('MBStyleDataSource');

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

export class MBStyleDataSource extends TileDataSource {
    private m_styleManager: MBStyleManager;
    private m_styleParams: MBStyleDataSourceParameters;

    constructor(params: MBStyleDataSourceParameters) {
        const styleManager = new MBStyleManager();

        const initialSources: TileDataSourceOptions = {
            tilingScheme: webMercatorTilingScheme,
            dataProvider: {
                getTile: async (_tileKey: TileKey) => new ArrayBuffer(0),
                connect: async () => {},
                dispose: async () => {},
                register: (_client: any) => {},
                unregister: (_client: any) => {},
                m_clients: [],
                m_connectPromise: undefined,
            } as unknown as DataProvider,
            concurrentDecoderServiceName:
                params.concurrentDecoderServiceName ?? MBSTYLE_DECODER_SERVICE_TYPE,
            concurrentDecoderScriptUrl: params.decoderScriptUrl,
            minDataLevel: 1,
            maxDataLevel: 22,
            storageLevelOffset: params.storageLevelOffset ?? -1,
        };

        super(new TileFactory(Tile), initialSources);

        this.m_styleManager = styleManager;
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

        this.registerWorkerDecoder();
        await this.configureDecoderForStyle();
        await super.connect();
    }

    private registerWorkerDecoder(): void {
        const scriptUrl = this.m_styleParams.decoderScriptUrl;
        if (scriptUrl) {
            // If custom decoder script URL provided, it will be used by
            // ConcurrentDecoderFacade when the decoder service is created.
        }
    }

    private async configureDecoderForStyle(): Promise<void> {
        const style = this.m_styleManager.getStyle();
        if (!style) return;

        const sources = this.m_styleManager.getResolvedSources();

        for (const [sourceId, source] of sources) {
            if (source.type === 'vector') {
                const restClient = this.createOmvRestClient(
                    source,
                    this.m_styleParams.accessToken
                );
                (this as any).m_dataProvider = restClient;

                await this.decoder.configure(undefined, {
                    mbStyle: style,
                    currentSourceId: sourceId,
                } as any);

                break;
            }
        }
    }

    async setTheme(theme: Theme | FlatTheme): Promise<void> {
        // MBStyleDataSource does not use flywave's Theme system.
        // Styles are driven by the Mapbox Style JSON passed in constructor.
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
}
