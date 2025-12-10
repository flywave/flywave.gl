/* Copyright (C) 2025 flywave.gl contributors */

import { type TileRenderDataSourceOptions, TileRenderDataSource } from "./TileRenderDataSource";

/**
 * Configuration options for the CesiumIonDataSource
 */
export interface CesiumIonDataSourceOptions extends Omit<TileRenderDataSourceOptions, 'url' | 'headers'> {
    /**
     * Cesium Ion access token
     */
    accessToken: string;

    /**
     * Cesium Ion asset ID
     */
    assetId: number;

    /**
     * Optional custom API endpoint URL
     */
    apiEndpoint?: string;
}

/**
 * A DataSource implementation for rendering Cesium Ion 3D Tiles datasets
 * 
 * This class extends TileRenderDataSource to provide seamless integration
 * with Cesium Ion services, handling authentication and endpoint resolution
 * automatically.
 */
export class CesiumIonDataSource extends TileRenderDataSource {
    private readonly m_accessToken: string;
    private readonly m_assetId: number;
    private readonly m_apiEndpoint: string;

    /**
     * Creates a new CesiumIonDataSource instance
     *
     * @param options - Configuration options for the data source
     */
    constructor(options: CesiumIonDataSourceOptions) {
        const { accessToken, assetId, apiEndpoint = "https://api.cesium.com/v1", ...baseOptions } = options;
        
        // Initialize parent class with placeholder values
        super({
            ...baseOptions,
            url: "", // Will be set after fetching endpoint
            headers: {} // Will be set after fetching endpoint
        } as TileRenderDataSourceOptions);

        this.m_accessToken = accessToken;
        this.m_assetId = assetId;
        this.m_apiEndpoint = apiEndpoint;
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
    async connect(): Promise<void> {
        try {
            // Fetch the asset endpoint information
            const endpointData = await this.fetchAssetEndpoint();
            
            // Update the tiles renderer with the actual URL and headers
            const tilesRenderer = this.tilesRenderer;
            if (tilesRenderer) {
                // Update URL and headers in the tiles renderer
                (tilesRenderer as any).options.url = endpointData.url;
                (tilesRenderer as any).fetchOptions.headers = {
                    authorization: `Bearer ${endpointData.accessToken}`
                };
                
                // Reinitialize the base renderer with the new URL
                // This is a workaround since the base class doesn't expose a method to update the URL
                const basePath = (tilesRenderer as any).rootURL;
                (tilesRenderer as any).rootURL = endpointData.url;
                
                // Reset loading state to trigger reload with new URL
                (tilesRenderer as any).rootLoadingState = 0; // UNLOADED state
            }
            
            // Call parent connect method
            await super.connect();
        } catch (error) {
            console.error("Failed to connect to Cesium Ion asset:", error);
            throw error;
        }
    }
}