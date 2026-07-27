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

import { MBStyleManager, ResolvedSource } from './MBStyleManager';
import { StyleSpecification } from './MBStyleSpec';

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
        // delegate will be connected externally
    }

    protected dispose(): void {
        this.delegate = null;
    }
}

export class MBStyleDataSource extends TileDataSource {
    private m_styleManager: MBStyleManager;
    private m_styleParams: MBStyleDataSourceParameters;
    private m_delegatingProvider: DelegatingDataProvider;

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

        const sources = this.m_styleManager.getResolvedSources();

        for (const [sourceId, source] of sources) {
            if (source.type === 'vector') {
                const restClient = this.createOmvRestClient(
                    source,
                    this.m_styleParams.accessToken
                );
                this.m_delegatingProvider.delegate = restClient;

                await this.decoder.configure(undefined, {
                    mbStyle: style,
                    currentSourceId: sourceId,
                } as any);

                break;
            }
        }

        await super.connect();
    }

    async setTheme(_theme: Theme | FlatTheme): Promise<void> {
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
