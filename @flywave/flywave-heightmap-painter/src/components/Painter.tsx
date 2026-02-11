import React, { useEffect, useRef, useState, forwardRef } from "react";
import styled from "styled-components";
import { BrushEngine } from "../utils/brushEngine";
import { BrushSettings, HeightmapExport, BrushType } from "../types";
import {
    WindowEventHandler,
    DataSource,
    GeoBox,
    GeoCoordinates,
    TerrainDataSource
} from "@flywave/flywave.gl";
import type { DEMTerrainSource, MapControls, MapView } from "@flywave/flywave.gl";

interface PainterProps {
    width: number;
    height: number;
    mapView: MapView;
    paintAreaGeoBox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    onBrushStart?: (x: number, y: number) => void;
    onBrushMove?: (x: number, y: number) => void;
    onBrushEnd?: () => void;
    onHeightmapChange?: (heightData: Float32Array) => void;
    mode?: "draw" | "navigate";
    mapControls?: MapControls;
}

export interface PainterRef {
    clearCanvas: () => void;
    exportHeightmap: () => HeightmapExport | null;
    updateBrushSettings: (settings: Partial<BrushSettings>) => void;
    getBrushSettings: () => BrushSettings;
    setDrawingMode: (enabled: boolean) => void;
}

const BrushCursor = styled.div<{ $visible: boolean; $size: number; $x: number; $y: number }>`
    position: fixed;
    left: 0;
    top: 0;
    width: ${props => props.$size}px;
    height: ${props => props.$size}px;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    pointer-events: none !important; /* Ensure mouse events pass through */
    -webkit-pointer-events: none; /* Safari compatibility */
    -moz-pointer-events: none; /* Firefox compatibility */
    transform: translate(
        ${props => props.$x - props.$size / 2}px,
        ${props => props.$y - props.$size / 2}px
    );
    z-index: 9999;
    display: ${props => (props.$visible ? "block" : "none")};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(2px);
    /* Ensure it doesn't affect mouse events */
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
`;

export const Painter = forwardRef<PainterRef, PainterProps>(
    (
        {
            width,
            height,
            mapView,
            paintAreaGeoBox,
            onBrushStart,
            onBrushMove,
            onBrushEnd,
            onHeightmapChange,
            mode,
            mapControls
        },
        ref
    ) => {
        const brushEngineRef = useRef<BrushEngine | null>(null);
        const windowEventHandlerRef = useRef<WindowEventHandler | null>(null);
        const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
        const currentBrushSizeRef = useRef(50);

        const [brushSettings, setBrushSettings] = useState<BrushSettings>({
            type: BrushType.RAISE,
            size: 50,
            sizeUnit: "meters",
            strength: 0.5,
            hardness: 0.5,
            flattenHeight: 0.5
        });

        const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
        const [cursorVisible, setCursorVisible] = useState(false);
        const [cursorSize, setCursorSize] = useState(50);
        const [isDrawingMode, setIsDrawingMode] = useState(false);
        const mapControlsRef = useRef<MapControls>(mapControls);
        const modifierIdRef = useRef<string>("heightmap-painter");
        const updateTerrainModifierRef = useRef<(() => void) | null>(null);

        const updateTerrainModifierImpl = () => {
            const manager = (
                mapView.elevationSource as DEMTerrainSource
            )?.getGroundModificationManager();
            if (!manager || !tempCanvasRef.current || !brushEngineRef.current) return;

            const canvas = tempCanvasRef.current;
            brushEngineRef.current.renderToCanvas(canvas);

            try {
                if (manager.hasModifier(modifierIdRef.current)) {
                    manager.updateModifier(modifierIdRef.current, { enabled: true });
                } else {
                    const southWest = new GeoCoordinates(
                        paintAreaGeoBox.minLat,
                        paintAreaGeoBox.minLon
                    );
                    const northEast = new GeoCoordinates(
                        paintAreaGeoBox.maxLat,
                        paintAreaGeoBox.maxLon
                    );
                    const geoBoxForDisplay = new GeoBox(southWest, northEast);

                    manager.addModifier(
                        modifierIdRef.current,
                        {
                            type: "image",
                            image: canvas
                        },
                        geoBoxForDisplay
                    );
                }
            } catch (error) {
                console.warn("Failed to update terrain modifier:", error);
            }
        };

        // Create throttled version
        useEffect(() => {
            let throttleTimer: number | null = null;
            let lastRun = 0;
            const throttleDelay = 50; // 50ms throttle

            const throttledUpdate = () => {
                const now = Date.now();
                if (now - lastRun >= throttleDelay) {
                    updateTerrainModifierImpl();
                    lastRun = now;
                } else if (throttleTimer === null) {
                    throttleTimer = window.setTimeout(() => {
                        updateTerrainModifierImpl();
                        lastRun = Date.now();
                        throttleTimer = null;
                    }, throttleDelay - (now - lastRun));
                }
            };

            updateTerrainModifierRef.current = throttledUpdate;

            return () => {
                if (throttleTimer !== null) {
                    clearTimeout(throttleTimer);
                }
            };
        }, [paintAreaGeoBox]);

        const updateTerrainModifier = () => {
            if (updateTerrainModifierRef.current) {
                updateTerrainModifierRef.current();
            }
        };

        useEffect(() => {
            console.log("[Painter] Initializing BrushEngine:", { width, height });
            const brushEngine = new BrushEngine(width, height);
            brushEngineRef.current = brushEngine;

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            tempCanvasRef.current = canvas;

            console.log("[Painter] Canvas created:", {
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                brushEngineDimensions: brushEngine.getDimensions()
            });

            return () => {
                brushEngineRef.current = null;
                tempCanvasRef.current = null;
            };
        }, [width, height, paintAreaGeoBox]);

        useEffect(() => {
            updateTerrainModifier();
        }, [paintAreaGeoBox]);

        useEffect(() => {
            if (brushEngineRef.current) {
                brushEngineRef.current.updateBrushSettings(brushSettings);
                currentBrushSizeRef.current = brushSettings.size;
            }
        }, [brushSettings]);

        // Initialize WindowEventHandler
        useEffect(() => {
            if (mapView && mapView.canvas) {
                const canvas = mapView.canvas as HTMLCanvasElement;

                // Create WindowEventHandler instance
                const windowEventHandler = new WindowEventHandler(canvas);
                windowEventHandlerRef.current = windowEventHandler;

                // Listen to mouse events
                const handleMouseDown = (event: MouseEvent) => {
                    if (!isDrawingMode || !mapView || !paintAreaGeoBox) return;

                    const x = event.offsetX;
                    const y = event.offsetY;

                    // Check if left mouse button is pressed via WindowEventHandler state
                    if (windowEventHandler.mouseDown[0]) {
                        const worldPos = mapView.getWorldPositionAt(x, y);
                        if (!worldPos) return;

                        const geoPos = mapView.projection.unprojectPoint(worldPos);
                        const coords = getCanvasCoordinates(geoPos.longitude, geoPos.latitude);
                        if (!coords) return;

                        brushEngineRef.current?.drawAt(coords.x, coords.y);

                        onBrushStart?.(coords.x, coords.y);
                        onHeightmapChange?.(brushEngineRef.current!.getHeightData());
                        updateTerrainModifier();
                    }
                };

                const handleMouseMove = (event: MouseEvent) => {
                    if (!mapView || !paintAreaGeoBox) return;

                    const x = event.offsetX;
                    const y = event.offsetY;

                    const worldPos = mapView.getWorldPositionAt(x, y);
                    if (!worldPos) {
                        setCursorVisible(false);
                        return;
                    }

                    const geoPos = mapView.projection.unprojectPoint(worldPos);

                    if (isDrawingMode) {
                        const coords = getCanvasCoordinates(geoPos.longitude, geoPos.latitude);

                        if (coords) {
                            const size = calculateCursorSize(brushSettings.size);
                            setCursorVisible(true);
                            setCursorPos({ x: event.clientX, y: event.clientY });
                            setCursorSize(size);

                            // Check if currently drawing (left mouse button pressed)
                            if (windowEventHandlerRef.current?.mouseDown[0]) {
                                brushEngineRef.current?.drawAt(coords.x, coords.y);
                                onBrushMove?.(coords.x, coords.y);
                                onHeightmapChange?.(brushEngineRef.current!.getHeightData());
                                updateTerrainModifier();
                            }
                        } else {
                            setCursorVisible(false);
                        }
                    } else {
                        setCursorVisible(false);
                    }
                };

                const handleMouseUp = () => {
                    // Trigger brush end event when mouse is released
                    if (isDrawingMode) {
                        onBrushEnd?.();
                    }
                };

                // Register event listeners
                windowEventHandler.addEventListener("mousedown", handleMouseDown as EventListener);
                windowEventHandler.addEventListener("mousemove", handleMouseMove as EventListener);
                windowEventHandler.addEventListener("mouseup", handleMouseUp);

                // Cleanup event listeners
                return () => {
                    if (windowEventHandler) {
                        windowEventHandler.removeEventListener(
                            "mousedown",
                            handleMouseDown as EventListener
                        );
                        windowEventHandler.removeEventListener(
                            "mousemove",
                            handleMouseMove as EventListener
                        );
                        windowEventHandler.removeEventListener("mouseup", handleMouseUp);
                        windowEventHandler.clearEvent();
                    }
                };
            }
        }, [mapView, isDrawingMode, brushSettings.size, paintAreaGeoBox]);

        // Listen to space key events
        useEffect(() => {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.code === "Space" && !event.repeat) {
                    event.preventDefault();
                    setIsDrawingMode(true);
                    // Disable map controls
                    if (mapControlsRef.current) {
                        mapControlsRef.current.enabled = false;
                        console.log("🖌️ Enter drawing mode - Map controls disabled");
                    } else {
                        console.warn(
                            "⚠️ Map controls instance not found, unable to control enable/disable state"
                        );
                    }
                }
            };

            const handleKeyUp = (event: KeyboardEvent) => {
                if (event.code === "Space") {
                    event.preventDefault();
                    setIsDrawingMode(false);
                    // Enable map controls
                    if (mapControlsRef.current) {
                        mapControlsRef.current.enabled = true;
                    }
                    // Trigger brush end event
                    onBrushEnd?.();
                }
            };

            window.addEventListener("keydown", handleKeyDown);
            window.addEventListener("keyup", handleKeyUp);

            return () => {
                window.removeEventListener("keydown", handleKeyDown);
                window.removeEventListener("keyup", handleKeyUp);
            };
        }, [onBrushEnd]);

        const getCanvasCoordinates = (lon: number, lat: number) => {
            if (
                lat < paintAreaGeoBox.minLat ||
                lat > paintAreaGeoBox.maxLat ||
                lon < paintAreaGeoBox.minLon ||
                lon > paintAreaGeoBox.maxLon
            ) {
                return null;
            }

            const normalizedX =
                (lon - paintAreaGeoBox.minLon) / (paintAreaGeoBox.maxLon - paintAreaGeoBox.minLon);
            const normalizedY =
                1 -
                (lat - paintAreaGeoBox.minLat) / (paintAreaGeoBox.maxLat - paintAreaGeoBox.minLat);

            return {
                x: normalizedX * width,
                y: normalizedY * height
            };
        };

        const calculateCursorSize = (brushSizeMeters: number): number => {
            const minSize = 20;
            const maxSize = 300;
            const size = Math.max(minSize, Math.min(maxSize, brushSizeMeters / 5));
            return size;
        };

        const clearCanvas = () => {
            brushEngineRef.current?.clear();
            updateTerrainModifier();
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const exportHeightmap = (): HeightmapExport | null => {
            if (!paintAreaGeoBox || !tempCanvasRef.current) return null;

            const tempCanvas = tempCanvasRef.current;

            if (brushEngineRef.current) {
                brushEngineRef.current.renderToCanvas(tempCanvas);
            }

            return {
                imageData: tempCanvas,
                geoBox: paintAreaGeoBox,
                width,
                height
            };
        };

        const updateBrushSettings = (settings: Partial<BrushSettings>) => {
            setBrushSettings((prev: BrushSettings) => {
                const updated = { ...prev, ...settings };

                if (settings.size !== undefined) {
                    const size = calculateCursorSize(updated.size);
                    setCursorSize(size);
                }

                return updated;
            });
        };

        const getBrushSettingsValue = () => brushSettings;

        const setDrawingMode = (enabledParam: boolean) => {
            setIsDrawingMode(enabledParam);
            if (mapControlsRef.current) {
                mapControlsRef.current.enabled = !enabledParam;
                console.log(
                    `${enabledParam ? "🖌️" : "🗺️"} ${
                        enabledParam ? "Enter" : "Exit"
                    } drawing mode - Map controls ${enabledParam ? "disabled" : "enabled"}`
                );
            } else {
                console.warn(
                    "⚠️ Map controls instance not found, unable to control enable/disable state"
                );
            }
            if (!enabledParam) {
                onBrushEnd?.();
            }
        };

        (ref as React.MutableRefObject<PainterRef>).current = {
            clearCanvas,
            exportHeightmap,
            updateBrushSettings,
            getBrushSettings: getBrushSettingsValue,
            setDrawingMode
        };

        return (
            <BrushCursor
                $visible={cursorVisible && isDrawingMode}
                $size={cursorSize}
                $x={cursorPos.x}
                $y={cursorPos.y}
            />
        );
    }
);

Painter.displayName = "Painter";
