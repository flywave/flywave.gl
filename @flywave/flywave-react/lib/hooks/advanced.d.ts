import { type VectorTileDataSource } from "@flywave/flywave.gl";
import type * as React from "react";
/**
 * Hook for managing map zoom level
 */
export declare function useMapZoom(): readonly [any, any];
/**
 * Hook for managing map camera position
 */
export declare function useMapCamera(): {
    isMoving: any;
    position: any;
    lookAt: any;
};
/**
 * Hook for adding and managing data sources
 */
export declare function useDataSource<T extends VectorTileDataSource>(createDataSource: () => T, dependencies?: React.DependencyList): {
    dataSource: any;
    isLoading: any;
    error: any;
};
/**
 * Hook for map statistics
 */
export declare function useMapStatistics(): any;
/**
 * Hook for handling map events
 */
export declare function useMapEvents(): {
    addEventListener: any;
    removeEventListener: any;
};
/**
 * Hook for managing map theme
 */
export declare function useMapTheme(): {
    currentTheme: any;
    isChanging: any;
    changeTheme: any;
};
/**
 * Hook for map picking/interaction
 */
export declare function useMapPicking(): {
    pick: any;
    pickGeoCoordinates: any;
};
