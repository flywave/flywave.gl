/* Copyright (C) 2025 flywave.gl contributors */

import type * as React from "react";
import { useEffect, useRef } from "react";

import { useMapContext } from "../MapProvider";
import { type MapEffectCallback, type MapEffectCleanup } from "../types";

/**
 * React hook for running effects that depend on the MapView instance.
 *
 * This hook will run the effect callback whenever the MapView becomes available,
 * and will call the cleanup function when the component unmounts or when the
 * dependencies change.
 *
 * @param effect - Function that receives the MapView and optionally returns a cleanup function
 * @param deps - Dependency array (similar to useEffect)
 *
 * @example
 * ```tsx
 * function DataSourceComponent() {
 *   useMapEffect((map) => {
 *     const dataSource = new VectorTileDataSource({
 *       baseUrl: "https://your-tiles-server.com",
 *       // ... other options
 *     });
 *
 *     map.addDataSource(dataSource);
 *
 *     return () => {
 *       map.removeDataSource(dataSource);
 *     };
 *   }, []);
 *
 *   return null;
 * }
 * ```
 */
export function useMapEffect(effect: MapEffectCallback, deps: React.DependencyList = []): void {
    const { mapView } = useMapContext();
    const cleanupRef = useRef<MapEffectCleanup | null>(null);
    const effectRef = useRef(effect);

    // Update effect ref when effect changes
    effectRef.current = effect;

    useEffect(() => {
        // Clean up previous effect if it exists
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }

        // Run effect if map is available
        if (mapView) {
            const cleanup = effectRef.current(mapView);
            if (cleanup) {
                cleanupRef.current = cleanup;
            }
        }

        // Cleanup function
        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, [mapView, ...deps]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, []);
}
