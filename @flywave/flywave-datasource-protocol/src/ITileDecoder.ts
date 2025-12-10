/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, type TileKey } from "@flywave/flywave-geoutils";

import { type DecodedTile } from "./DecodedTile";
import { type Definitions, type StylePriority, type StyleSet } from "./Theme";
import { type TileInfo } from "./TileInfo";
import { type OptionsMap, type RequestController } from "./WorkerDecoderProtocol";

export interface DecoderOptions {
    /**
     * The StyleSet to be applied during decoding.
     */
    styleSet?: StyleSet;

    /**
     * The Definitions to be applied during decoding.
     */
    definitions?: Definitions;

    /**
     * The Priorities to be applied during decoding.
     */
    priorities?: StylePriority[];

    /**
     * The Label Priorities to be applied during decoding.
     */
    labelPriorities?: string[];

    /**
     * A prioritized list of language codes to be applied.
     */
    languages?: string[];
}

/**
 * General type decoder which can be used to provide decoded tile data.
 */
export interface ITileDecoder {
    /**
     * Connect to decoder.
     *
     * Should be implemented by implementations that use special resources that decode jobs like
     * WebWorkers.
     */
    connect(): Promise<void>;

    /**
     * Decode tile into transferrable geometry.
     *
     * Decode raw tile data (encoded with datasource specific encoding) into transferrable
     * representation of tile's geometry.
     *
     * See [[DecodedTile]].
     */
    decodeTile(
        data: ArrayBufferLike | Record<string, unknown>,
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<DecodedTile | undefined>;

    /**
     * Get tile info.
     *
     * Get map features metadata associated with tile. See [[TileInfo]].
     */
    getTileInfo(
        data: ArrayBufferLike | Record<string, unknown>,
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<TileInfo | undefined>;

    /**
     * Set decoder configuration.
     *
     * Configuration will take effect for next calls to results of [[decodeTile]],
     * [[decodeThemedTile]].
     *
     * Non-existing (`undefined`) options (including styleSet) are not changed.
     *
     * @param options - configuration options
     * @param customOptions - optional, new options - shape is specific for each decoder
     */
    configure(options?: DecoderOptions, customOptions?: OptionsMap): void;

    /**
     * Free all resources associated with this decoder.
     *
     * Called by users when decoder is no longer used and all resources must be freed.
     */
    dispose(): void;
}
