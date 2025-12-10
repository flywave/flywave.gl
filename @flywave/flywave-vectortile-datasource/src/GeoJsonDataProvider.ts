/* Copyright (C) 2025 flywave.gl contributors */

import {
    type FeatureCollection,
    type GeoJson,
    type ITiler,
    WorkerServiceProtocol
} from "@flywave/flywave-datasource-protocol";
import * as nodefetch from "@flywave/flywave-fetch";
import { type TileKey, webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import { ConcurrentTilerFacade } from "@flywave/flywave-mapview";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { LoggerManager } from "@flywave/flywave-utils";

import { GEOJSON_TILER_SERVICE_TYPE } from "./OmvDecoderDefs";

const logger = LoggerManager.instance.create("GeoJsonDataProvider");

const INVALIDATED = "invalidated";

import { geojsonRbush } from "@turf/geojson-rbush";

// Simple RBush-based tiler implementation
export class RBushTiler implements ITiler {
    private readonly m_indexes = new Map<string, any>(); // Using 'any' type for RBush

    /**
     * Connect to tiler.
     */
    async connect(): Promise<void> {
        // No special connection needed for this implementation
        await Promise.resolve();
    }

    /**
     * Register index in the tiler.
     *
     * @param indexId - Index identifier.
     * @param indexUrl - Url to the index payload, or direct GeoJson.
     */
    async registerIndex(indexId: string, indexUrl: URL | GeoJson): Promise<void> {
        let geoJson: GeoJson;

        if (indexUrl instanceof URL) {
            const response = await fetch(indexUrl.href);
            if (!response.ok) {
                throw new Error(
                    "RBushTiler: Unable to fetch " + indexUrl.href + ": " + response.statusText
                );
            }
            geoJson = (await response.json()) as GeoJson;
        } else {
            geoJson = indexUrl as GeoJson;
        }

        const rbush = geojsonRbush();

        // Load the GeoJSON data into the RBush index
        if (geoJson.type === "FeatureCollection") {
            rbush.load(geoJson as any);
        } else if (geoJson.type === "Feature") {
            rbush.insert(geoJson as any);
        } else {
            // For geometry objects, wrap them in a feature
            rbush.insert({
                type: "Feature",
                geometry: geoJson,
                properties: {}
            });
        }

        this.m_indexes.set(indexId, rbush);
    }

    /**
     * Update index in the tiler.
     *
     * @param indexId - Index identifier.
     * @param indexUrl - Url to the index payload, or direct GeoJson.
     */
    async updateIndex(indexId: string, indexUrl: URL | GeoJson): Promise<void> {
        // For simplicity, we'll just re-register the index
        // In a more sophisticated implementation, you might want to diff and update
        this.m_indexes.delete(indexId);
        await this.registerIndex(indexId, indexUrl);
    }

    /**
     * Retrieves a tile for a previously registered index.
     *
     * @param indexId - Index identifier.
     * @param tileKey - The [[TileKey]] that identifies the tile.
     */
    async getTile(indexId: string, tileKey: TileKey): Promise<Record<string, unknown>> {
        const rbush = this.m_indexes.get(indexId);
        if (rbush === undefined) {
            throw new Error("Index with id '" + indexId + "' not found");
        }

        // Get the bounding box for the tile
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        const bbox = [geoBox.west, geoBox.south, geoBox.east, geoBox.north];

        // Search for features within the bounding box
        const features = rbush.search(bbox);

        // Return as FeatureCollection
        return Promise.resolve({
            type: "FeatureCollection",
            features: features.features
        });
    }

    /**
     * Free all resources associated with this tiler.
     */
    dispose(): void {
        this.m_indexes.clear();
    }
}

export interface GeoJsonDataProviderOptions {
    /**
     * Worker script hosting `Tiler` service.
     * @default `./decoder.bundle.ts`
     */
    workerTilerUrl?: string;

    /**
     * Custom tiler instance.
     *
     * @remarks
     * If not provided, {@link GeoJsonDataProvider} will obtain `WorkerBasedTiler`
     * from `ConcurrentTilerFacade`.
     */
    tiler?: ITiler;

    /**
     * Timeout for connecting to the web worker in seconds. Default to 10s, search for:
     * DEFAULT_WORKER_INITIALIZATION_TIMEOUT
     */
    workerConnectionTimeout?: number;
}

let missingTilerServiceInfoEmitted: boolean = false;

/**
 * GeoJson {@link @flywave/flywave-mapview-decoder@DataProvider}.
 *
 * @remarks
 * Automatically handles tiling and simplification of static GeoJson.
 */
export class GeoJsonDataProvider extends DataProvider {
    private readonly m_tiler: ITiler;
    private m_registered = false;

    /**
     * Constructs a new `GeoJsonDataProvider`.
     *
     * @param name - Name to be used to reference this `DataProvider`
     * @param input - URL of the GeoJSON, or a GeoJSON.
     * @param options - Optional
     * @returns New `GeoJsonDataProvider`.
     */
    constructor(
        readonly name: string,
        public input: URL | GeoJson,
        options?: GeoJsonDataProviderOptions
    ) {
        super();

        this.m_tiler =
            options?.tiler ??
            ConcurrentTilerFacade.getTiler(
                GEOJSON_TILER_SERVICE_TYPE,
                options?.workerTilerUrl,
                options?.workerConnectionTimeout
            );
    }

    async connect(): Promise<void> {
        try {
            await this.m_tiler.connect();
        } catch (error) {
            if (
                WorkerServiceProtocol.isUnknownServiceError(error) &&
                !missingTilerServiceInfoEmitted
            ) {
                logger.info(
                    "Unable to start GeoJson tiler service in worker. Use " +
                        " 'OmvTilerService.start();' in decoder script."
                );
                missingTilerServiceInfoEmitted = true;
            }
            throw error;
        }

        await this.m_tiler.registerIndex(this.name, this.input);
        this.m_registered = true;
    }

    updateInput(input: URL | GeoJson) {
        this.input = input;
        this.m_tiler.updateIndex(this.name, this.input);
        this.dispatchEvent({ type: INVALIDATED });
    }

    ready(): boolean {
        return this.m_registered;
    }

    async getTile(tileKey: TileKey): Promise<Record<string, unknown>> {
        return await this.m_tiler.getTile(this.name, tileKey);
    }

    onDidInvalidate(listener: () => void) {
        this.addEventListener(INVALIDATED, listener);
        return () => this.removeEventListener(INVALIDATED, listener);
    }

    /**
     * Destroys this `GeoJsonDataProvider`.
     */
    dispose() {
        this.m_tiler.dispose();
    }
}
