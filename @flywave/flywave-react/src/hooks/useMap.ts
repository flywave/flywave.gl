/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave.gl";

import { useMapContext } from "../MapProvider";

/**
 * React hook to access the MapView instance from any child component.
 *
 * This hook must be used within a MapContainer context. It returns the
 * current MapView instance or null if the map is not yet initialized.
 *
 * @returns The MapView instance or null
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const map = useMap();
 *
 *   useEffect(() => {
 *     if (map) {
 *       // Use map instance
 *       map.lookAt({
 *         target: new GeoCoordinates(52.518611, 13.376111),
 *         zoomLevel: 10
 *       });
 *     }
 *   }, [map]);
 *
 *   return <div>My Map Component</div>;
 * }
 * ```
 */
export function useMap(): MapView | null {
    const { mapView } = useMapContext();
    return mapView;
}
