import type * as React from "react";
import { type MapEffectCallback } from "../types";
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
export declare function useMapEffect(effect: MapEffectCallback, deps?: React.DependencyList): void;
