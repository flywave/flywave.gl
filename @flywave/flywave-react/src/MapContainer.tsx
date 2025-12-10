/* Copyright (C) 2025 flywave.gl contributors */

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
export function MapContainer({
    // MapProvider props
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
    // Canvas props with defaults
    const { style = { width: "100%", height: "100%" }, className } = options;

    return (
        <MapProvider
            theme={theme}
            decoderUrl={decoderUrl}
            enableControls={enableControls}
            enableStatistics={enableStatistics}
            decoderCount={decoderCount}
            onMapInitialized={onMapInitialized}
            onMapDisposed={onMapDisposed}
            onResize={onResize}
            {...options}
        >
            <MapCanvas style={style} className={className} onResize={onResize} />
            {children}
        </MapProvider>
    );
}

export { MapProvider, MapCanvas, useMap, useMapContext };
