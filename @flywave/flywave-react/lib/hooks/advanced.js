/* Copyright (C) 2025 flywave.gl contributors */
import { MapViewEventNames } from "@flywave/flywave.gl";
import { useCallback, useEffect, useState } from "react";
import { useMap } from "./useMap";
import { useMapEffect } from "./useMapEffect";
/**
 * Hook for managing map zoom level
 */
export function useMapZoom() {
    const map = useMap();
    const [zoomLevel, setZoomLevel] = useState(0);
    useEffect(() => {
        if (!map)
            return;
        const updateZoom = () => {
            setZoomLevel(map.zoomLevel);
        };
        updateZoom();
        map.addEventListener(MapViewEventNames.Update, updateZoom);
        return () => {
            map.removeEventListener(MapViewEventNames.Update, updateZoom);
        };
    }, [map]);
    const setZoom = useCallback((zoom) => {
        if (map) {
            map.zoomLevel = Math.max(1, Math.min(20, zoom));
        }
    }, [map]);
    return [zoomLevel, setZoom];
}
/**
 * Hook for managing map camera position
 */
export function useMapCamera() {
    const map = useMap();
    const [isMoving, setIsMoving] = useState(false);
    const [position, setPosition] = useState(null);
    useEffect(() => {
        if (!map)
            return;
        const updateCamera = () => {
            setIsMoving(map.cameraIsMoving);
            setPosition(map.geoCenter);
        };
        updateCamera();
        map.addEventListener(MapViewEventNames.Update, updateCamera);
        return () => {
            map.removeEventListener(MapViewEventNames.Update, updateCamera);
        };
    }, [map]);
    const lookAt = useCallback((target, zoomLevel) => {
        if (map) {
            map.lookAt({
                target,
                zoomLevel: zoomLevel ?? map.zoomLevel
            });
        }
    }, [map]);
    return {
        isMoving,
        position,
        lookAt
    };
}
/**
 * Hook for adding and managing data sources
 */
export function useDataSource(createDataSource, dependencies = []) {
    const [dataSource, setDataSource] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    useMapEffect(map => {
        setIsLoading(true);
        setError(null);
        try {
            const ds = createDataSource();
            map.addDataSource(ds);
            setDataSource(ds);
            setIsLoading(false);
            return () => {
                map.removeDataSource(ds);
                setDataSource(null);
            };
        }
        catch (err) {
            const dsError = err instanceof Error ? err : new Error("Failed to create data source");
            setError(dsError);
            setIsLoading(false);
        }
    }, dependencies);
    return {
        dataSource,
        isLoading,
        error
    };
}
/**
 * Hook for map statistics
 */
export function useMapStatistics() {
    const map = useMap();
    const [stats, setStats] = useState({
        frameNumber: 0,
        renderTime: 0,
        fps: 0,
        visibleTiles: 0
    });
    useEffect(() => {
        if (!map)
            return;
        const updateStats = () => {
            setStats({
                frameNumber: map.frameNumber,
                renderTime: 0, // Would need to implement render time tracking
                fps: 0, // Would need to implement FPS tracking
                visibleTiles: 0 // Would need to implement visible tiles count
            });
        };
        updateStats();
        map.addEventListener(MapViewEventNames.Update, updateStats);
        return () => {
            map.removeEventListener(MapViewEventNames.Update, updateStats);
        };
    }, [map]);
    return stats;
}
/**
 * Hook for handling map events
 */
export function useMapEvents() {
    const map = useMap();
    const addEventListener = useCallback((event, handler) => {
        if (map) {
            map.addEventListener(event, handler);
        }
    }, [map]);
    const removeEventListener = useCallback((event, handler) => {
        if (map) {
            map.removeEventListener(event, handler);
        }
    }, [map]);
    return {
        addEventListener,
        removeEventListener
    };
}
/**
 * Hook for managing map theme
 */
export function useMapTheme() {
    const map = useMap();
    const [currentTheme, setCurrentTheme] = useState(null);
    const [isChanging, setIsChanging] = useState(false);
    const changeTheme = useCallback(async (themeUrl) => {
        if (!map)
            return;
        setIsChanging(true);
        try {
            await map.setTheme(themeUrl);
            setCurrentTheme(themeUrl);
        }
        catch (err) {
            console.error("Failed to change theme:", err);
        }
        finally {
            setIsChanging(false);
        }
    }, [map]);
    return {
        currentTheme,
        isChanging,
        changeTheme
    };
}
/**
 * Hook for map picking/interaction
 */
export function useMapPicking() {
    const map = useMap();
    const pick = useCallback((x, y) => {
        if (!map)
            return null;
        return map.intersectMapObjects(x, y);
    }, [map]);
    const pickGeoCoordinates = useCallback((x, y) => {
        if (!map)
            return null;
        return map.getGeoCoordinatesAt(x, y);
    }, [map]);
    return {
        pick,
        pickGeoCoordinates
    };
}
//# sourceMappingURL=advanced.js.map