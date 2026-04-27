import { type GeoCoordinates, type VectorTileDataSource, MapViewEventNames } from "@flywave/flywave.gl";
import type * as React from "react";
/**
 * Hook for managing map zoom level
 */
export declare function useMapZoom(): readonly [number, (zoom: number) => void];
/**
 * Hook for managing map camera position
 */
export declare function useMapCamera(): {
    isMoving: boolean;
    position: any;
    lookAt: (target: GeoCoordinates, zoomLevel?: number) => void;
};
/**
 * Hook for adding and managing data sources
 */
export declare function useDataSource<T extends VectorTileDataSource>(createDataSource: () => T, dependencies?: React.DependencyList): {
    dataSource: T;
    isLoading: boolean;
    error: Error;
};
/**
 * Hook for map statistics
 */
export declare function useMapStatistics(): {
    frameNumber: number;
    renderTime: number;
    fps: number;
    visibleTiles: number;
};
/**
 * Hook for handling map events
 */
export declare function useMapEvents(): {
    addEventListener: (event: MapViewEventNames, handler: any) => void;
    removeEventListener: (event: MapViewEventNames, handler: any) => void;
};
/**
 * Hook for managing map theme
 */
export declare function useMapTheme(): {
    currentTheme: string;
    isChanging: boolean;
    changeTheme: (themeUrl: string) => Promise<void>;
};
/**
 * Hook for map picking/interaction
 */
export declare function useMapPicking(): {
    pick: (x: number, y: number) => any;
    pickGeoCoordinates: (x: number, y: number) => any;
};
