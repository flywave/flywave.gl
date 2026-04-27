import { type Theme } from "@flywave/flywave-datasource-protocol";
import { type OmvRestClientParameters } from "@flywave/flywave-vectortile-datasource";
export interface OMVDecoderPerformanceTestOptions {
    /**
     *
     */
    repeats?: number;
    /**
     * Theme url or object.
     *
     * Will be resolved using [[ThemeLoader.load]].
     */
    theme: Theme | string;
    /**
     * Styleset name, defaults to `tilezen`.
     */
    styleSetName?: string;
    /**
     * Morton codes of tiles.
     */
    tiles: number[];
    /**
     * Requires settings for [[OmvRestClient]] to download tiles.
     */
    omvRestClientOptions: OmvRestClientParameters;
}
/**
 * Create tests that downloads some OMV tiles from real datasource, then decodes them using
 * particular style.
 *
 * @see OMVDecoderPerformanceTestOptions
 */
export declare function createOMVDecoderPerformanceTest(name: string, options: OMVDecoderPerformanceTestOptions): void;
