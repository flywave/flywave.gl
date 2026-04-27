import * as React from "react";
import { MapView } from "@flywave/flywave.gl";
import { MapControls } from "@flywave/flywave.gl";
import { MapContextValue, MapProviderProps, MapCanvasProps } from "./types";
/**
 * React Context for sharing MapView instance across components
 */
export declare const MapContext: React.Context<MapContextValue>;
/**
 * Hook to get the map context, throws error if used outside MapProvider
 */
export declare function useMapContext(): MapContextValue;
/**
 * Hook to access the MapView instance from any child component.
 *
 * @returns The MapView instance or null
 */
export declare function useMap(): MapView | null;
export declare function useMapControls(): MapControls | null;
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
export declare function MapProvider({ children, theme, decoderUrl, enableControls, enableStatistics, decoderCount, onMapInitialized, onMapDisposed, onResize, ...options }: MapProviderProps & MapCanvasProps): React.JSX.Element;
