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
export declare class CesiumWorldTerrainSource extends QuantizedTerrainSource {
    private readonly m_accessToken;
    private readonly m_apiEndpoint;
    private readonly m_assetId;
    private m_isConnected;
    /**
     * Creates a new CesiumWorldTerrainSource instance
     *
     * @param options - Configuration options for the Cesium World Terrain source
     */
    constructor(options: CesiumWorldTerrainSourceOptions);
    /**
     * Gets the Cesium Ion access token used by this terrain source
     */
    get accessToken(): string;
    /**
     * Gets the API endpoint used by this terrain source
     */
    get apiEndpoint(): string;
    /**
     * Gets the asset ID used by this terrain source
     */
    get assetId(): number;
    /**
     * Fetches the asset endpoint information from Cesium Ion API
     * @returns Promise that resolves to the endpoint data
     */
    private fetchAssetEndpoint;
    /**
     * Called when the data source is attached to a MapView
     * @returns Promise that resolves when connection is complete
     */
    connect(): Promise<void>;
}
