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
    pointer-events: none !important;
    -webkit-pointer-events: none;
    -moz-pointer-events: none;
    transform: translate(
        ${props => props.$x - props.$size / 2}px,
        ${props => props.$y - props.$size / 2}px
    );
    z-index: 9999;
    display: ${props => (props.$visible ? "block" : "none")};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(2px);
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
        const modifierIdRef = useRef<string>("heightmap-painter");
        const modifierReadyRef = useRef<boolean>(false);

        const [brushSettings, setBrushSettings] = useState<BrushSettings>({
            type: BrushType.RAISE,
            size: 50,
            sizeUnit: "meters",
            targetHeight: 50,
            hardness: 0.5,
            flattenHeight: 0.5
        });

        const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
        const [cursorVisible, setCursorVisible] = useState(false);
        const [cursorSize, setCursorSize] = useState(50);
        const [isDrawingMode, setIsDrawingMode] = useState(false);
        const mapControlsRef = useRef<MapControls>(mapControls);

        const initModifier = () => {
            const manager = (
                mapView.elevationSource as DEMTerrainSource
            )?.getGroundModificationManager();
            if (!manager || !brushEngineRef.current) return;

            const southWest = new GeoCoordinates(paintAreaGeoBox.minLat, paintAreaGeoBox.minLon);
            const northEast = new GeoCoordinates(paintAreaGeoBox.maxLat, paintAreaGeoBox.maxLon);
            const geoBox = new GeoBox(southWest, northEast);

            const texture = brushEngineRef.current.getTexture();

            manager.addModifier(
                modifierIdRef.current,
                {
                    type: "image",
                    image: new ImageData(
                        new Uint8ClampedArray(texture.image.data.buffer.slice(0)),
                        texture.image.width,
                        texture.image.height
                    )
                },
                geoBox,
                "add"
            );

            manager.updateModifierTexture(modifierIdRef.current, texture);
            modifierReadyRef.current = true;
        };

        const updateModifierTexture = () => {
            const manager = (
                mapView.elevationSource as DEMTerrainSource
            )?.getGroundModificationManager();
            if (!manager || !brushEngineRef.current || !modifierReadyRef.current) return;

            const texture = brushEngineRef.current.getTexture();
            manager.updateModifierTexture(modifierIdRef.current, texture);
            const range = brushEngineRef.current.getHeightRange();
            manager.updateModifierHeightRange(modifierIdRef.current, range.min, range.max);
        };

        useEffect(() => {
            const brushEngine = new BrushEngine(width, height);
            brushEngineRef.current = brushEngine;

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            tempCanvasRef.current = canvas;

            initModifier();

            return () => {
                brushEngineRef.current = null;
                tempCanvasRef.current = null;
                modifierReadyRef.current = false;
            };
        }, [width, height, paintAreaGeoBox]);

        useEffect(() => {
            if (brushEngineRef.current) {
                brushEngineRef.current.updateBrushSettings(brushSettings);
                currentBrushSizeRef.current = brushSettings.size;
            }
        }, [brushSettings]);

        useEffect(() => {
            if (mapView && mapView.canvas) {
                const canvas = mapView.canvas as HTMLCanvasElement;

                const windowEventHandler = new WindowEventHandler(canvas);
                windowEventHandlerRef.current = windowEventHandler;

                const handleMouseDown = (event: MouseEvent) => {
                    if (!isDrawingMode || !mapView || !paintAreaGeoBox) return;

                    const x = event.offsetX;
                    const y = event.offsetY;

                    if (windowEventHandler.mouseDown[0]) {
                        const worldPos = mapView.getWorldPositionAt(x, y);
                        if (!worldPos) return;

                        const geoPos = mapView.projection.unprojectPoint(worldPos);
                        const coords = getCanvasCoordinates(geoPos.longitude, geoPos.latitude);
                        if (!coords) return;

                        brushEngineRef.current?.resetStroke();
                        brushEngineRef.current?.drawAt(coords.x, coords.y);

                        onBrushStart?.(coords.x, coords.y);
                        onHeightmapChange?.(brushEngineRef.current!.getHeightData());
                        updateModifierTexture();
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

                            if (windowEventHandlerRef.current?.mouseDown[0]) {
                                brushEngineRef.current?.drawAt(coords.x, coords.y);
                                onBrushMove?.(coords.x, coords.y);
                                onHeightmapChange?.(brushEngineRef.current!.getHeightData());
                                updateModifierTexture();
                            }
                        } else {
                            setCursorVisible(false);
                        }
                    } else {
                        setCursorVisible(false);
                    }
                };

                const handleMouseUp = () => {
                    if (isDrawingMode) {
                        brushEngineRef.current?.resetStroke();
                        onBrushEnd?.();
                    }
                };

                windowEventHandler.addEventListener("mousedown", handleMouseDown as EventListener);
                windowEventHandler.addEventListener("mousemove", handleMouseMove as EventListener);
                windowEventHandler.addEventListener("mouseup", handleMouseUp);

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

        useEffect(() => {
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.code === "Space" && !event.repeat) {
                    event.preventDefault();
                    setIsDrawingMode(true);
                    if (mapControlsRef.current) {
                        mapControlsRef.current.enabled = false;
                    }
                }
            };

            const handleKeyUp = (event: KeyboardEvent) => {
                if (event.code === "Space") {
                    event.preventDefault();
                    setIsDrawingMode(false);
                    if (mapControlsRef.current) {
                        mapControlsRef.current.enabled = true;
                    }
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
            updateModifierTexture();
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
