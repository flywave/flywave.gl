import React, { useEffect, useRef, useState, forwardRef } from "react";
import styled from "styled-components";
import { BrushEngine } from "../utils/brushEngine";
import { BrushSettings, HeightmapExport, BrushType } from "../types";
import { WindowEventHandler } from "@flywave/flywave.gl";

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
    pointer-events: none !important;  /* 确保鼠标事件穿透 */
    -webkit-pointer-events: none;  /* Safari兼容 */
    -moz-pointer-events: none;  /* Firefox兼容 */
    transform: translate(
        ${props => props.$x - props.$size / 2}px,
        ${props => props.$y - props.$size / 2}px
    );
    z-index: 9999;
    display: ${props => (props.$visible ? "block" : "none")};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(2px);
    /* 确保不会影响鼠标事件 */
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
            mode
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

        // 初始化 WindowEventHandler
        useEffect(() => {
            if (mapView && mapView.canvas) {
                const canvas = mapView.canvas as HTMLCanvasElement;
                
                // 创建 WindowEventHandler 实例
                const windowEventHandler = new WindowEventHandler(canvas);
                windowEventHandlerRef.current = windowEventHandler;

                // 监听鼠标事件
                const handleMouseDown = (event: MouseEvent) => {
                    if (mode !== "draw" || !mapView || !paintAreaGeoBox) return;

                    const x = event.offsetX;
                    const y = event.offsetY;

                    // 通过 WindowEventHandler 的状态来判断是否是左键按下
                    if (windowEventHandler.mouseDown[0]) {
                        const worldPos = mapView.getWorldPositionAt(x, y);
                        if (!worldPos) return;

                        const geoPos = mapView.projection.unprojectPoint(worldPos);
                        const coords = getCanvasCoordinates(geoPos.longitude, geoPos.latitude);
                        if (!coords) return;

                        brushEngineRef.current?.drawAt(coords.x, coords.y);

                        onBrushStart?.(coords.x, coords.y);
                        onHeightmapChange?.(brushEngineRef.current!.getHeightData());
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

                    if (mode === "draw") {
                        const coords = getCanvasCoordinates(geoPos.longitude, geoPos.latitude);

                        if (coords) {
                            const size = calculateCursorSize(brushSettings.size);
                            setCursorVisible(true);
                            setCursorPos({ x: event.clientX, y: event.clientY });
                            setCursorSize(size);

                            // 检查是否正在绘制（左键按下状态）
                            if (windowEventHandlerRef.current?.mouseDown[0]) {
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
                    // 鼠标释放后触发结束绘制事件
                    if (mode === "draw") {
                        onBrushEnd?.();
                    }
                };

                // 注册事件监听器
                windowEventHandler.addEventListener('mousedown', handleMouseDown as EventListener);
                windowEventHandler.addEventListener('mousemove', handleMouseMove as EventListener);
                windowEventHandler.addEventListener('mouseup', handleMouseUp);

                // 清理事件监听器
                return () => {
                    if (windowEventHandler) {
                        windowEventHandler.removeEventListener('mousedown', handleMouseDown as EventListener);
                        windowEventHandler.removeEventListener('mousemove', handleMouseMove as EventListener);
                        windowEventHandler.removeEventListener('mouseup', handleMouseUp);
                        windowEventHandler.clearEvent();
                    }
                };
            }
        }, [mapView, mode, brushSettings.size, paintAreaGeoBox]);

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