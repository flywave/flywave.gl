/* Copyright (C) 2025 flywave.gl contributors */

import { type MapControls, type MapView, type Theme, MapViewOptions } from "@flywave/flywave.gl";
import type * as React from "react";

/**
 * Configuration options for MapProvider
 */
export interface MapProviderOptions extends Record<string, unknown> {
    /**
     * Map theme URL or theme object
     */
    theme?: string | Theme;

    /**
     * URL to the decoder worker bundle
     */
    decoderUrl?: string;

    /**
     * Whether to create map controls automatically
     */
    enableControls?: boolean;

    /**
     * Whether to enable statistics
     */
    enableStatistics?: boolean;

    /**
     * Maximum number of concurrent decoders
     */
    decoderCount?: number;
}

/**
 * Props for MapProvider component
 */
export interface MapProviderProps extends MapProviderOptions {
    children?: React.ReactNode;
}

/**
 * Props for MapCanvas component
 */
export interface MapCanvasProps {
    /**
     * CSS style object for the canvas element
     */
    style?: React.CSSProperties;

    /**
     * CSS class name for the canvas element
     */
    className?: string;

    /**
     * Callback fired when the map is initialized
     */
    onMapInitialized?: (mapView: MapView) => void;

    /**
     * Callback fired when the map is disposed
     */
    onMapDisposed?: () => void;

    /**
     * Callback fired on map resize
     */
    onResize?: (width: number, height: number) => void;

    /**
     * Children elements
     */
    children?: React.ReactNode;
}

/**
 * Map context value
 */
export interface MapContextValue {
    /**
     * The MapView instance, null if not yet initialized
     */
    mapView: MapView | null;

    /**
     * Map Controller
     */
    mapControls: React.MutableRefObject<MapControls | null>;

    /**
     * Whether the map is currently loading/initializing
     */
    isLoading: boolean;

    /**
     * Error that occurred during map initialization, if any
     */
    error: Error | null;

    /**
     * Configuration options used for the map
     */
    options: MapProviderOptions;

    /**
     * Canvas reference for MapCanvas component
     */
    canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;

    /**
     * Function to initialize the map
     */
    initializeMap?: (canvas: HTMLCanvasElement) => Promise<MapView | null>;

    /**
     * Function to dispose the map
     */
    disposeMap?: () => void;
}

/**
 * Effect cleanup function
 */
export type MapEffectCleanup = () => void;

/**
 * Effect function that receives the map instance
 */
export type MapEffectCallback = (mapView: MapView) => MapEffectCleanup | void;
