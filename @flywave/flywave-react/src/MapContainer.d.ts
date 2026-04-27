import * as React from "react";
import { MapProvider, useMap, useMapContext } from "./MapProvider";
import { MapCanvas } from "./MapCanvas";
import { MapProviderProps, MapCanvasProps } from "./types";
/**
 * React component that creates and manages a MapView instance and renders the map canvas.
 *
 * This component combines the functionality of MapProvider and MapCanvas into a single component
 * for backward compatibility.
 *
 * @example
 * ```tsx
 * <MapContainer
 *   theme="resources/tilezen_base.json"
 *   decoderUrl="./decoder.bundle.js"
 *   style={{ width: '100%', height: '400px' }}
 * />
 * ```
 */
export declare function MapContainer({ children, theme, decoderUrl, enableControls, enableStatistics, decoderCount, onMapInitialized, onMapDisposed, onResize, ...options }: MapProviderProps & MapCanvasProps): React.JSX.Element;
export { MapProvider, MapCanvas, useMap, useMapContext };
