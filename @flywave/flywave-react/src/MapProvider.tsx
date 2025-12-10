/* Copyright (C) 2025 flywave.gl contributors */

import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { MapView, MapViewOptions, MapViewPowerPreference } from "@flywave/flywave.gl";
import { MapControls } from "@flywave/flywave.gl";
import { LoggerManager } from "@flywave/flywave.gl";

import { MapContextValue, MapProviderProps, MapProviderOptions, MapCanvasProps } from "./types";

const logger = LoggerManager.instance.create("MapProvider");

/**
 * React Context for sharing MapView instance across components
 */
export const MapContext = createContext<MapContextValue | null>(null);

/**
 * Hook to get the map context, throws error if used outside MapProvider
 */
export function useMapContext(): MapContextValue {
    const context = useContext(MapContext);
    if (!context) {
        throw new Error("useMapContext must be used within a MapProvider");
    }
    return context;
}

/**
 * Hook to access the MapView instance from any child component.
 *
 * @returns The MapView instance or null
 */
export function useMap(): MapView | null {
    const { mapView } = useMapContext();
    return mapView;
}

export function useMapControls(): MapControls | null {
    const { mapControls } = useMapContext();
    return mapControls;
}

/**
 * Default options for MapProvider
 */
const DEFAULT_OPTIONS: Partial<MapProviderOptions> = {
    enableControls: true,
    enableStatistics: false,
    decoderCount: 1
};

/**
 * React component that creates and manages a MapView instance.
 *
 * This component is responsible for creating and managing the MapView instance
 * and providing it to child components through context.
 *
 * @example
 * ```tsx
 * <MapProvider
 *   theme="resources/tilezen_base.json"
 *   decoderUrl="./decoder.bundle.js"
 * >
 *   <MapCanvas style={{ width: '100%', height: '400px' }} />
 * </MapProvider>
 * ```
 */
export function MapProvider({
    children,
    theme,
    decoderUrl,
    enableControls = true,
    enableStatistics = false,
    decoderCount = 1,
    onMapInitialized,
    onMapDisposed,
    onResize,
    ...options
}: MapProviderProps & MapCanvasProps): React.JSX.Element {
    const [mapView, setMapView] = useState<MapView | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);
    const mapControlsRef = useRef<MapControls | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Merge options with defaults
    const mergedOptions: MapProviderOptions & MapCanvasProps = {
        ...DEFAULT_OPTIONS,
        theme,
        decoderUrl,
        enableControls,
        enableStatistics,
        decoderCount,
        onMapInitialized,
        onMapDisposed,
        onResize,
        ...options
    };

    /**
     * Initialize MapView with the provided canvas
     */
    const initializeMap = useCallback(
        async (canvas: HTMLCanvasElement) => {
            // If map already exists, don't reinitialize
            if (mapView) {
                return mapView;
            }

            setIsLoading(true);
            setError(null);

            try {
                // Prepare MapView options
                const mapViewOptions: MapViewOptions = {
                    canvas,
                    theme: mergedOptions.theme || "resources/tilezen_base.json",
                    decoderUrl: mergedOptions.decoderUrl || "./decoder.bundle.js",
                    enableStatistics: mergedOptions.enableStatistics,
                    decoderCount: mergedOptions.decoderCount,
                    powerPreference: MapViewPowerPreference.HighPerformance,
                    ...mergedOptions
                };

                // Create MapView instance
                const newMapView = new MapView(mapViewOptions);

                // Set up map controls if enabled
                if (mergedOptions.enableControls) {
                    const controls = new MapControls(newMapView);
                    mapControlsRef.current = controls;
                }

                // Store the cleanup function on the mapView for later use
                (newMapView as any)._cleanup = () => {
                    if (mapControlsRef.current) {
                        mapControlsRef.current = null;
                    }
                };

                setMapView(newMapView);
                setIsLoading(false);

                mergedOptions.onMapInitialized?.(newMapView);

                logger.info("MapView initialized successfully");
                return newMapView;
            } catch (err) {
                const initError =
                    err instanceof Error ? err : new Error("Failed to initialize MapView");
                setError(initError);
                setIsLoading(false);
                logger.error("Failed to initialize MapView:", initError);
                throw initError;
            }
        },
        [mapView, mergedOptions]
    );

    /**
     * Dispose of the MapView and clean up resources
     */
    const disposeMap = useCallback(() => {
        if (mapView) {
            try {
                // Call custom cleanup if available
                if ((mapView as any)._cleanup) {
                    (mapView as any)._cleanup();
                }

                // Dispose of map controls
                if (mapControlsRef.current) {
                    mapControlsRef.current = null;
                }

                // Dispose of MapView
                mapView.dispose();

                setMapView(null);
                setError(null);

                mergedOptions.onMapDisposed?.();

                logger.info("MapView disposed successfully");
            } catch (err) {
                logger.error("Error disposing MapView:", err);
            }
        }
    }, [mapView, mergedOptions]);

    const contextValue: MapContextValue = {
        mapView,
        isLoading,
        error,
        options: mergedOptions,
        mapControls: mapControlsRef.current,
        canvasRef,
        initializeMap: initializeMap as (canvas: HTMLCanvasElement) => Promise<MapView | null>,
        disposeMap
    };

    // Clean up on unmount
    useEffect(() => {
        return () => disposeMap();
    }, [disposeMap]);

    return <MapContext.Provider value={contextValue}>{children}</MapContext.Provider>;
}
