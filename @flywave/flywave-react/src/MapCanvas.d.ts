import * as React from "react";
import { MapCanvasProps } from "./types";
/**
 * React component that renders the map canvas.
 *
 * This component is responsible for rendering the canvas element and connecting it
 * to the MapView instance provided by MapProvider.
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
export declare function MapCanvas({ style, className, onResize }: MapCanvasProps): React.JSX.Element;
