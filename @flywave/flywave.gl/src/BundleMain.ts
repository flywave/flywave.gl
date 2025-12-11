/* Copyright (C) 2025 flywave.gl contributors */

import { ConcurrentDecoderFacade, ConcurrentTilerFacade } from "@flywave/flywave-mapview";
import { baseUrl, UriResolver } from "@flywave/flywave-utils";


/**
 * Global declaration for flywave.gl resource base URL variables
 */
declare global {
    interface Window {
        FLYWAVE_BASE_URL?: string;
    }
}

/**
 * Type declaration for the webpack-defined variable
 */
declare const FLYWAVE_BASE_URL: string | undefined;

/**
 * UriResolver for map assets.
 *
 * If a base directory for resources is specified, it resolves URIs relative to that directory.
 * Otherwise, it attempts to resolve URIs from the network.
 *
 * The base resource URL can be defined in two ways:
 * 1. As a global variable: window.FLYWAVE_BASE_URL
 * 2. Through webpack DefinePlugin: FLYWAVE_BASE_URL
 */
class MapAssetsUriResolver implements UriResolver {

    /**
     * Get the current base resource URL
     */
    get baseResourceUrl(): string | undefined {
        // Priority order for determining base resource URL:
        // 1. Global variable (window.FLYWAVE_BASE_URL)
        // 2. Webpack DefinePlugin variable (FLYWAVE_BASE_URL)
        // 3. undefined (fallback to network resolution)
        if (typeof FLYWAVE_BASE_URL !== "undefined") {
            return FLYWAVE_BASE_URL;
        }
        if (typeof window !== "undefined" && window.FLYWAVE_BASE_URL) {
            return window.FLYWAVE_BASE_URL;
        }
        return undefined;
    }


    resolveUri(uri: string): string {

        // If it's already an absolute URL, return as is
        if (uri.startsWith("http://") || uri.startsWith("https://")) {
            return uri;
        }

        let _baseResourceUrl = this.baseResourceUrl

        // If a base resource URL is specified, resolve relative to it
        if (_baseResourceUrl) {
            // Remove leading slash if present to avoid double slashes
            if (uri.startsWith("/")) {
                uri = uri.substring(1);
            }

            // Ensure base URL ends with a slash
            const base = _baseResourceUrl.endsWith("/")
                ? _baseResourceUrl
                : _baseResourceUrl + "/";

            return base + uri;
        }

        // If all else fails, return the URI as is (will be resolved by the browser)
        return uri;
    }
}

window.FLYWAVE_BASE_URL = "https://flywave.github.io/flywave.gl/";

// Export a singleton instance
export const mapAssetsUriResolver = new MapAssetsUriResolver();

/**
 * Default decoder url for bundled map component.
 */
export const DEFAULT_DECODER_SCRIPT_URL = "flywave-decoders.js";

/**
 * Basename of map bundle script - used by [[mapAssetsUriResolver.baseResourceUrl]] as fallback, when
 * `document.currentScript` is not present.
 *
 * @hidden
 */
export const BUNDLE_SCRIPT_BASENAME = "flywave.gl";


/**
 * Get script URL assumet it's already loaded in DOM.
 *
 * Required to find default URLs `flywave.(min.)js` and `three().min).js` which are required to
 * properly start decoder bundle.
 *
 * @see https://stackoverflow.com/questions/2976651
 * @hidden
 */
export function getScriptUrl(name: string): string | undefined | null {
    const scriptElement =
        document.querySelector(`script[src*='/${name}.min.js']`) ??
        document.querySelector(`script[src='${name}.min.js']`) ??
        document.querySelector(`script[src*='/${name}.js']`) ??
        document.querySelector(`script[src='${name}.js']`);

    if (scriptElement) {
        return (scriptElement as HTMLScriptElement).src;
    } else {
        return undefined;
    }
}

const getActualDecoderScriptUrl = () => {
    const baseScriptUrl = mapAssetsUriResolver.baseResourceUrl;
    if (!baseScriptUrl) {
        // eslint-disable-next-line no-console
        console.error(
            `flywave.gl: Unable to determine default location of 'flywave-decoders(min).js'. ` +
            `See https://github.com/flywave/flywave.gl/@flywave/flywave.gl.`
        );
    }
    const isMinified = baseScriptUrl && baseScriptUrl.endsWith(".min.js");

    const decoderScriptName = !isMinified
        ? DEFAULT_DECODER_SCRIPT_URL
        : DEFAULT_DECODER_SCRIPT_URL.replace(/\.js$/, ".min.js");
    return mapAssetsUriResolver.resolveUri(decoderScriptName);
};

/**
 * Guess decoder script URL.
 *
 * Assumes that decoder script - `FLYWAVE-decoders.js` is in same place as main bundle and calculates
 * it's URL.
 *
 * Minified version of `flywave.gl.js` bundle loads minified version of decoder.
 * Hooks in [[ConcurrentDecoderFacade]] to use this URL as default `defaultScriptUrl`.
 *
 * @hidden
 */
export function mapBundleMain() {
    ConcurrentDecoderFacade.defaultScriptUrl = "";
    ConcurrentTilerFacade.defaultScriptUrl = "";

    const oldDecoderGetWorkerSet = ConcurrentDecoderFacade.getWorkerSet;
    ConcurrentDecoderFacade.getWorkerSet = (scriptUrl?: string) => {
        if (scriptUrl === undefined && ConcurrentDecoderFacade.defaultScriptUrl === "") {
            const newScriptUrl = getActualDecoderScriptUrl();

            ConcurrentDecoderFacade.defaultScriptUrl = newScriptUrl;
        }
        return oldDecoderGetWorkerSet.apply(ConcurrentDecoderFacade, [scriptUrl]);
    };

    const oldTilerGetWorkerSet = ConcurrentTilerFacade.getWorkerSet;
    ConcurrentTilerFacade.getWorkerSet = (scriptUrl?: string) => {
        if (scriptUrl === undefined && ConcurrentTilerFacade.defaultScriptUrl === "") {
            const newScriptUrl = getActualDecoderScriptUrl();

            ConcurrentTilerFacade.defaultScriptUrl = newScriptUrl;
        }
        return oldTilerGetWorkerSet.apply(ConcurrentTilerFacade, [scriptUrl]);
    };
}