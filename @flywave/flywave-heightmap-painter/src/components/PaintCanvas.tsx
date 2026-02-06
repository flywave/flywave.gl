import React, { useEffect, useRef, useState, forwardRef, useCallback } from "react";
import L from "leaflet";
import styled from "styled-components";
import { BrushEngine } from "../utils/brushEngine";
import { BrushSettings, HeightmapExport, BrushType } from "../types";

interface PaintCanvasProps {
    width: number;
    height: number;
    initialCenter: [number, number];
    initialZoom: number;
    basemap: "satellite" | "street" | "terrain";
    paintAreaGeoBox: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
    onReconfigure: () => void;
    onExport: (data: HeightmapExport) => void;
    onBrushStart?: (x: number, y: number) => void;
    onBrushMove?: (x: number, y: number) => void;
    onBrushEnd?: () => void;
    onHeightmapChange?: (heightData: Float32Array) => void;
    mode: "draw" | "navigate";
}

export interface PaintCanvasRef {
    clearCanvas: () => void;
    exportHeightmap: () => HeightmapExport | null;
    updateBrushSettings: (settings: Partial<BrushSettings>) => void;
    getBrushSettings: () => BrushSettings;
}

const Container = styled.div<{ width: number; height: number }>`
    width: 100%;
    height: 100%;
    position: relative;
    border: none;
    border-radius: 0;
    overflow: hidden;
    background: #000;
`;

const MapDiv = styled.div`
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
`;

const TopBar = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(180deg, rgba(30, 30, 30, 0.98) 0%, rgba(20, 20, 20, 0.95) 100%);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    z-index: 3000;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
`;

const Title = styled.div`
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.5px;
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 8px;
`;

const Button = styled.button<{ $variant?: "primary" | "danger" | "default" }>`
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

    ${props =>
        props.$variant === "primary"
            ? `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        &:active {
            transform: translateY(0);
        }
    `
            : props.$variant === "danger"
            ? `
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
        }
        &:active {
            transform: translateY(0);
        }
    `
            : `
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        &:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.3);
        }
        &:active {
            transform: translateY(0);
        }
    `}
`;

export const PaintCanvas = forwardRef<PaintCanvasRef, PaintCanvasProps>(
    (
        {
            width,
            height,
            initialCenter,
            initialZoom,
            basemap,
            paintAreaGeoBox,
            onReconfigure,
            onExport,
            onBrushStart,
            onBrushMove,
            onBrushEnd,
            onHeightmapChange,
            mode
        },
        ref
    ) => {
        const mapRef = useRef<L.Map | null>(null);
        const mapDivRef = useRef<HTMLDivElement>(null);
        const brushEngineRef = useRef<BrushEngine | null>(null);
        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        const isDrawingRef = useRef(false);

        const [brushSettings, setBrushSettings] = useState<BrushSettings>({
            type: BrushType.RAISE,
            size: 50,
            strength: 0.5,
            hardness: 0.5,
            flattenHeight: 0.5
        });

        useEffect(() => {
            if (!mapDivRef.current) return;

            const centerLat = (paintAreaGeoBox.minLat + paintAreaGeoBox.maxLat) / 2;
            const centerLon = (paintAreaGeoBox.minLon + paintAreaGeoBox.maxLon) / 2;

            const map = L.map(mapDivRef.current, {
                center: [centerLat, centerLon] as [number, number],
                zoom: initialZoom,
                zoomControl: false,
                dragging: false,
                touchZoom: false,
                doubleClickZoom: false,
                scrollWheelZoom: false,
                boxZoom: false,
                keyboard: false
            });

            let tileUrl =
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
            let attribution = "Tiles &copy; Esri";

            if (basemap === "street") {
                tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
                attribution = "&copy; OpenStreetMap";
            } else if (basemap === "terrain") {
                tileUrl = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
                attribution = "&copy; OpenTopoMap";
            }

            L.tileLayer(tileUrl, {
                attribution: attribution
            }).addTo(map);

            mapRef.current = map;

            const brushEngine = new BrushEngine(width, height);
            brushEngineRef.current = brushEngine;

            const bounds = L.latLngBounds(
                [paintAreaGeoBox.minLat, paintAreaGeoBox.minLon],
                [paintAreaGeoBox.maxLat, paintAreaGeoBox.maxLon]
            );

            L.rectangle(bounds, {
                color: "#ff0000",
                weight: 2,
                fillColor: "#ff0000",
                fillOpacity: 0.0
            }).addTo(map);

            map.fitBounds(bounds, { padding: [20, 20] });

            map.setMaxBounds(bounds.pad(0.5));

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            canvas.style.position = "absolute";
            canvas.style.pointerEvents = "none";
            canvas.style.opacity = "0.7";
            canvas.style.zIndex = "1000";

            const overlayPane = map.getPanes().overlayPane;
            overlayPane.appendChild(canvas);
            canvasRef.current = canvas;

            const updateCanvas = () => {
                if (!canvas || !brushEngineRef.current) return;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                brushEngineRef.current.renderToCanvas(canvas);
            };

            const onMove = () => {
                const min = map.latLngToLayerPoint(bounds.getSouthWest());
                const max = map.latLngToLayerPoint(bounds.getNorthEast());

                const topLeft = L.point(Math.min(min.x, max.x), Math.min(min.y, max.y));
                L.DomUtil.setPosition(canvas, topLeft);
                canvas.style.width = `${Math.abs(max.x - min.x)}px`;
                canvas.style.height = `${Math.abs(max.y - min.y)}px`;

                updateCanvas();
            };

            map.on("move", onMove);
            map.on("moveend", onMove);
            map.on("zoom", onMove);
            map.on("zoomend", onMove);

            setTimeout(() => {
                onMove();
            }, 100);

            return () => {
                map.remove();
                if (canvasRef.current && canvasRef.current.parentNode) {
                    canvasRef.current.parentNode.removeChild(canvasRef.current);
                }
            };
        }, []);

        useEffect(() => {
            if (brushEngineRef.current) {
                brushEngineRef.current.updateBrushSettings(brushSettings);
            }
        }, [brushSettings]);

        useEffect(() => {
            if (!mapRef.current) return;

            const map = mapRef.current;

            if (mode === "navigate") {
                map.dragging.enable();
                map.touchZoom.disable();
                map.doubleClickZoom.disable();
                map.scrollWheelZoom.disable();
                map.boxZoom.disable();
                map.keyboard.disable();
            } else {
                map.dragging.disable();
                map.touchZoom.disable();
                map.doubleClickZoom.disable();
                map.scrollWheelZoom.disable();
                map.boxZoom.disable();
                map.keyboard.disable();

                const bounds = L.latLngBounds(
                    [paintAreaGeoBox.minLat, paintAreaGeoBox.minLon],
                    [paintAreaGeoBox.maxLat, paintAreaGeoBox.maxLon]
                );
                map.fitBounds(bounds, { padding: [20, 20] });
            }
        }, [mode]);

        const getCanvasCoordinates = (e: any) => {
            if (!mapRef.current) return null;

            const latlng = e.latlng;
            if (!latlng) return null;

            if (
                latlng.lat < paintAreaGeoBox.minLat ||
                latlng.lat > paintAreaGeoBox.maxLat ||
                latlng.lng < paintAreaGeoBox.minLon ||
                latlng.lng > paintAreaGeoBox.maxLon
            ) {
                return null;
            }

            const normalizedX =
                (latlng.lng - paintAreaGeoBox.minLon) /
                (paintAreaGeoBox.maxLon - paintAreaGeoBox.minLon);
            const normalizedY =
                1 -
                (latlng.lat - paintAreaGeoBox.minLat) /
                    (paintAreaGeoBox.maxLat - paintAreaGeoBox.minLat);

            return {
                x: normalizedX * width,
                y: normalizedY * height
            };
        };

        const handleMouseDown = (e: any) => {
            if (mode !== "draw") return;
            const coords = getCanvasCoordinates(e);
            if (!coords) return;

            isDrawingRef.current = true;
            brushEngineRef.current?.drawAt(coords.x, coords.y);
            updateCanvasDisplay();

            onBrushStart?.(coords.x, coords.y);
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const handleMouseMove = (e: any) => {
            if (mode !== "draw" || !isDrawingRef.current) return;

            const coords = getCanvasCoordinates(e);
            if (!coords) return;

            brushEngineRef.current?.drawAt(coords.x, coords.y);
            updateCanvasDisplay();

            onBrushMove?.(coords.x, coords.y);
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const updateCanvasDisplay = () => {
            if (!canvasRef.current || !brushEngineRef.current) return;
            const ctx = canvasRef.current.getContext("2d");
            if (!ctx) return;

            ctx.imageSmoothingEnabled = true;
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = width;
            tempCanvas.height = height;
            brushEngineRef.current.renderToCanvas(tempCanvas);

            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(tempCanvas, 0, 0, canvasRef.current.width, canvasRef.current.height);
        };

        const handleMouseUp = () => {
            if (!isDrawingRef.current) return;
            isDrawingRef.current = false;
            onBrushEnd?.();
        };

        useEffect(() => {
            if (!mapRef.current) return;

            mapRef.current.on("mousedown", handleMouseDown);
            mapRef.current.on("mousemove", handleMouseMove);
            mapRef.current.on("mouseup", handleMouseUp);
            mapRef.current.on("mouseout", handleMouseUp);

            return () => {
                if (mapRef.current) {
                    mapRef.current.off("mousedown", handleMouseDown);
                    mapRef.current.off("mousemove", handleMouseMove);
                    mapRef.current.off("mouseup", handleMouseUp);
                    mapRef.current.off("mouseout", handleMouseUp);
                }
            };
        }, [mode, handleMouseDown, handleMouseMove, handleMouseUp]);

        const clearCanvas = () => {
            brushEngineRef.current?.clear();
            updateCanvasDisplay();
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const exportHeightmap = (): HeightmapExport | null => {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = width;
            tempCanvas.height = height;

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
            setBrushSettings((prev: BrushSettings) => ({ ...prev, ...settings }));
        };

        const getBrushSettingsValue = () => brushSettings;

        const handleExport = () => {
            const data = exportHeightmap();
            if (data) {
                onExport(data);
            }
        };

        (ref as React.MutableRefObject<PaintCanvasRef>).current = {
            clearCanvas,
            exportHeightmap,
            updateBrushSettings,
            getBrushSettings: getBrushSettingsValue
        };

        return (
            <Container width={width} height={height}>
                <TopBar>
                    <Title>
                        🎨 绘制中 - {width}x{height}
                    </Title>
                    <ButtonGroup>
                        <Button $variant="default" onClick={onReconfigure}>
                            ↩ 重新配置
                        </Button>
                        <Button $variant="primary" onClick={handleExport}>
                            📥 导出
                        </Button>
                    </ButtonGroup>
                </TopBar>

                <MapDiv ref={mapDivRef} />
            </Container>
        );
    }
);

PaintCanvas.displayName = "PaintCanvas";
