/* Copyright (C) 2025 flywave.gl contributors */

import { QuantizedTerrainSource, type QuantizedTerrainSourceOptions } from "./QuantizedTerrainSource";

/**
 * Configuration options for CesiumWorldTerrainSource
 *
 * Extends the base quantized terrain source options with Cesium Ion specific parameters.
 * This simplifies access to Cesium World Terrain by handling the access token authentication
 * automatically.
 */
export interface CesiumWorldTerrainSourceOptions extends Omit<QuantizedTerrainSourceOptions, 'url' | 'headers'> {
    /**
     * Cesium Ion access token
     *
     * This token is used to authenticate requests to Cesium World Terrain services.
     * You can obtain a token from your Cesium Ion account.
     */
    accessToken: string;

    /**
     * Optional custom API endpoint URL
     *
     * Allows specifying a custom Cesium Ion API endpoint for specialized deployments.
     *
     * @default "https://api.cesium.com/v1"
     */
    apiEndpoint?: string;

    /**
     * Optional custom asset ID
     *
     * Allows specifying a custom asset ID for alternative terrain datasets.
     * The default is Cesium World Terrain (asset ID 1).
     *
     * @default 1
     */
    assetId?: number;
}

/**
 * Implementation of a terrain source for Cesium World Terrain data
 *
 * This class simplifies access to Cesium World Terrain by automatically handling
 * the authentication flow with Cesium Ion access tokens. It extends the standard
 * QuantizedTerrainSource with Cesium-specific configuration options.
 *
 * The source provides efficient storage and transmission of terrain data by using
 * a variable level of detail (LOD) approach that adapts to the viewer's distance
 * from the terrain surface.
 */
export class CesiumWorldTerrainSource extends QuantizedTerrainSource {
    private readonly m_accessToken: string;
    private readonly m_apiEndpoint: string;
    private readonly m_assetId: number;
    private m_isConnected: boolean = false;

    /**
     * Creates a new CesiumWorldTerrainSource instance
     *
     * @param options - Configuration options for the Cesium World Terrain source
     */
    constructor(options: CesiumWorldTerrainSourceOptions) {
        const { accessToken, apiEndpoint = "https://api.cesium.com/v1", assetId = 1, ...baseOptions } = options;

        // Initialize parent class with placeholder values
        super({
            ...baseOptions,
            url: "https://assets.ion.cesium.com/ap-northeast-1/asset_depot/1/CesiumWorldTerrain/v1.2/layer.json", // Will be set after fetching endpoint
        } as QuantizedTerrainSourceOptions);

        this.m_accessToken = accessToken;
        this.m_apiEndpoint = apiEndpoint;
        this.m_assetId = assetId;
    }

    /**
     * Gets the Cesium Ion access token used by this terrain source
     */
    public get accessToken(): string {
        return this.m_accessToken;
    }

    /**
     * Gets the API endpoint used by this terrain source
     */
    public get apiEndpoint(): string {
        return this.m_apiEndpoint;
    }

    /**
     * Gets the asset ID used by this terrain source
     */
    public get assetId(): number {
        return this.m_assetId;
    }

    /**
     * Fetches the asset endpoint information from Cesium Ion API
     * @returns Promise that resolves to the endpoint data
     */
    private async fetchAssetEndpoint(): Promise<any> {
        const endpointUrl = `${this.m_apiEndpoint}/assets/${this.m_assetId}/endpoint`;

        const response = await fetch(endpointUrl, {
            headers: {
                Authorization: `Bearer ${this.m_accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch asset endpoint: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Called when the data source is attached to a MapView
     * @returns Promise that resolves when connection is complete
     */
    public async connect(): Promise<void> {
        // Return immediately if already connected
        if (this.m_isConnected) {
            return Promise.resolve();
        }

        try {
            // Fetch the asset endpoint information
            const endpointData = await this.fetchAssetEndpoint();

            // Update the data provider with the actual URL and headers
            const dataProvider = this.dataProvider();
            if (dataProvider) {
                // Update URL and headers in the layer strategy options
                (dataProvider as any).layerStrategyOptions = {
                    ...(dataProvider as any).layerStrategyOptions,
                    url: endpointData.url,
                    headers: {
                        authorization: `Bearer ${endpointData.accessToken}`
                    }
                };

                // Reconnect the data provider with new options
                return super.connect();
            }

            this.m_isConnected = true;
        } catch (error) {
            console.error("Failed to connect to Cesium World Terrain:", error);
            throw error;
        }
    }
}