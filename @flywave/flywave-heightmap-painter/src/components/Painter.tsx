import React, { useEffect, useRef, useState, forwardRef } from "react";
import styled from "styled-components";
import { BrushEngine } from "../utils/brushEngine";
import { BrushSettings, HeightmapExport, BrushType } from "../types";

interface PainterProps {
    width: number;
    height: number;
    mapView: any;
    paintAreaGeoBox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    onBrushStart?: (x: number, y: number) => void;
    onBrushMove?: (x: number, y: number) => void;
    onBrushEnd?: () => void;
    onHeightmapChange?: (heightData: Float32Array) => void;
    mode: "draw" | "navigate";
}

export interface PainterRef {
    clearCanvas: () => void;
    exportHeightmap: () => HeightmapExport | null;
    updateBrushSettings: (settings: Partial<BrushSettings>) => void;
    getBrushSettings: () => BrushSettings;
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
    pointer-events: none;
    transform: translate(
        ${props => props.$x - props.$size / 2}px,
        ${props => props.$y - props.$size / 2}px
    );
    z-index: 10000;
    display: ${props => (props.$visible ? "block" : "none")};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(2px);
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
            mode
        },
        ref
    ) => {
        const brushEngineRef = useRef<BrushEngine | null>(null);
        const isDrawingRef = useRef(false);
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

        useEffect(() => {
            const brushEngine = new BrushEngine(width, height);
            brushEngineRef.current = brushEngine;

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            tempCanvasRef.current = canvas;

            return () => {
                brushEngineRef.current = null;
                tempCanvasRef.current = null;
            };
        }, [width, height, paintAreaGeoBox]);

        useEffect(() => {
            if (brushEngineRef.current) {
                brushEngineRef.current.updateBrushSettings(brushSettings);
                currentBrushSizeRef.current = brushSettings.size;
            }
        }, [brushSettings]);

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

        const handleMouseDown = (event: MouseEvent) => {
            if (mode !== "draw" || !mapView || !paintAreaGeoBox) return;

            const rect = (mapView.canvas as HTMLCanvasElement).getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const worldPos = mapView.getWorldPositionAt(x, y);
            if (!worldPos) return;

            const geoPos = mapView.projection.unprojectPoint(worldPos);
            const coords = getCanvasCoordinates(geoPos.longitude, geoPos.latitude);
            if (!coords) return;

            isDrawingRef.current = true;
            brushEngineRef.current?.drawAt(coords.x, coords.y);

            onBrushStart?.(coords.x, coords.y);
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (!mapView || !paintAreaGeoBox) return;

            const rect = (mapView.canvas as HTMLCanvasElement).getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const worldPos = mapView.getWorldPositionAt(x, y);
            if (!worldPos) {
                setCursorVisible(false);
                return;
            }

            const geoPos = mapView.projection.unprojectPoint(worldPos);

            if (mode === "draw") {
                const coords = getCanvasCoordinates(geoPos.longitude, geoPos.latitude);

                if (coords) {
                    const size = calculateCursorSize(brushSettings.size);
                    setCursorVisible(true);
                    setCursorPos({ x: event.clientX, y: event.clientY });
                    setCursorSize(size);

                    if (isDrawingRef.current) {
                        brushEngineRef.current?.drawAt(coords.x, coords.y);
                        onBrushMove?.(coords.x, coords.y);
                        onHeightmapChange?.(brushEngineRef.current!.getHeightData());
                    }
                } else {
                    setCursorVisible(false);
                }
            } else {
                setCursorVisible(false);
            }
        };

        const handleMouseUp = () => {
            if (!isDrawingRef.current) return;
            isDrawingRef.current = false;
            onBrushEnd?.();
        };

        useEffect(() => {
            if (!mapView || !mapView.canvas) return;

            const canvas = mapView.canvas as HTMLCanvasElement;

            canvas.addEventListener("mousedown", handleMouseDown);
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);

            return () => {
                canvas.removeEventListener("mousedown", handleMouseDown);
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
            };
        }, [mapView, mode, brushSettings.size]);

        const clearCanvas = () => {
            brushEngineRef.current?.clear();
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

        (ref as React.MutableRefObject<PainterRef>).current = {
            clearCanvas,
            exportHeightmap,
            updateBrushSettings,
            getBrushSettings: getBrushSettingsValue
        };

        return (
            <BrushCursor
                $visible={cursorVisible && mode === "draw"}
                $size={cursorSize}
                $x={cursorPos.x}
                $y={cursorPos.y}
            />
        );
    }
);

Painter.displayName = "Painter";
