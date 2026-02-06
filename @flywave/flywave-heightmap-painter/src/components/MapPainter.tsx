import React, { useEffect, useRef, useState, forwardRef } from "react";
import L from "leaflet";
import styled from "styled-components";
import { BrushEngine } from "../utils/brushEngine";
import { BrushSettings, HeightmapExport, BrushType } from "../types";

interface MapPainterProps {
    width: number;
    height: number;
    initialCenter?: [number, number];
    initialZoom?: number;
    basemap?: "satellite" | "street" | "terrain";
    paintAreaGeoBox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    onBrushStart?: (x: number, y: number) => void;
    onBrushMove?: (x: number, y: number) => void;
    onBrushEnd?: () => void;
    onHeightmapChange?: (heightData: Float32Array) => void;
}

export interface MapPainterRef {
    clearCanvas: () => void;
    exportHeightmap: () => HeightmapExport | null;
    updateBrushSettings: (settings: Partial<BrushSettings>) => void;
    getBrushSettings: () => BrushSettings;
}

const Container = styled.div`
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
`;

const MapDiv = styled.div`
    width: 100%;
    height: 100%;
`;

export const MapPainter = forwardRef<MapPainterRef, MapPainterProps>(
    (
        {
            width,
            height,
            initialCenter = [39.9, 116.4],
            initialZoom = 13,
            basemap = "satellite",
            paintAreaGeoBox,
            onBrushStart,
            onBrushMove,
            onBrushEnd,
            onHeightmapChange
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

            let center = initialCenter;
            let zoom = initialZoom;

            if (paintAreaGeoBox) {
                const centerLat = (paintAreaGeoBox.minLat + paintAreaGeoBox.maxLat) / 2;
                const centerLon = (paintAreaGeoBox.minLon + paintAreaGeoBox.maxLon) / 2;
                center = [centerLat, centerLon] as [number, number];
                zoom = 15;
            }

            const map = L.map(mapDivRef.current, {
                center: center,
                zoom: zoom,
                zoomControl: true
            });

            let tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
            let attribution = "&copy; OpenStreetMap";

            if (basemap === "satellite") {
                tileUrl =
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
                attribution = "Tiles &copy; Esri";
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

            if (paintAreaGeoBox) {
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

                map.fitBounds(bounds, { padding: [50, 50] });

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                canvas.style.position = "absolute";
                canvas.style.pointerEvents = "none";
                canvas.style.opacity = "0.7";
                canvas.style.zIndex = "1000";
                canvas.style.top = "0";
                canvas.style.left = "0";

                const overlayPane = map.getPanes().overlayPane;
                overlayPane.appendChild(canvas);
                canvasRef.current = canvas;

                const updateCanvas = () => {
                    if (!canvas || !brushEngineRef.current) return;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;

                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    brushEngineRef.current.renderToCanvas(tempCanvas);

                    ctx.imageSmoothingEnabled = false;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
                };

                const onMove = () => {
                    const min = map.latLngToLayerPoint(bounds.getSouthWest());
                    const max = map.latLngToLayerPoint(bounds.getNorthEast());
                    const size = max.subtract(min);

                    L.DomUtil.setPosition(canvas, min);
                    canvas.width = Math.max(1, size.x);
                    canvas.height = Math.max(1, size.y);

                    updateCanvas();
                };

                map.on("move", onMove);
                map.on("moveend", onMove);
                map.on("zoom", onMove);
                map.on("zoomend", onMove);

                setTimeout(updateCanvas, 500);
            }

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

        const getCanvasCoordinates = (latlng: L.LatLng) => {
            if (!paintAreaGeoBox) return null;

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
            const coords = getCanvasCoordinates(e.latlng);
            if (!coords) return;

            isDrawingRef.current = true;
            brushEngineRef.current?.drawAt(coords.x, coords.y);

            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext("2d");
                if (ctx && brushEngineRef.current) {
                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    brushEngineRef.current.renderToCanvas(tempCanvas);
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    ctx.drawImage(
                        tempCanvas,
                        0,
                        0,
                        canvasRef.current.width,
                        canvasRef.current.height
                    );
                }
            }

            onBrushStart?.(coords.x, coords.y);
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const handleMouseMove = (e: any) => {
            if (!isDrawingRef.current) return;

            const coords = getCanvasCoordinates(e.latlng);
            if (!coords) return;

            brushEngineRef.current?.drawAt(coords.x, coords.y);

            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext("2d");
                if (ctx && brushEngineRef.current) {
                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    brushEngineRef.current.renderToCanvas(tempCanvas);
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    ctx.drawImage(
                        tempCanvas,
                        0,
                        0,
                        canvasRef.current.width,
                        canvasRef.current.height
                    );
                }
            }

            onBrushMove?.(coords.x, coords.y);
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const handleMouseUp = () => {
            if (!isDrawingRef.current) return;
            isDrawingRef.current = false;
            onBrushEnd?.();
        };

        useEffect(() => {
            if (!mapRef.current || !paintAreaGeoBox) return;

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
        }, [handleMouseDown, handleMouseMove, handleMouseUp]);

        const clearCanvas = () => {
            brushEngineRef.current?.clear();
            if (canvasRef.current && brushEngineRef.current) {
                const ctx = canvasRef.current.getContext("2d");
                if (ctx) {
                    brushEngineRef.current.renderToCanvas(canvasRef.current);
                }
            }
            onHeightmapChange?.(brushEngineRef.current!.getHeightData());
        };

        const exportHeightmap = (): HeightmapExport | null => {
            if (!paintAreaGeoBox) return null;

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

        (ref as React.MutableRefObject<MapPainterRef>).current = {
            clearCanvas,
            exportHeightmap,
            updateBrushSettings,
            getBrushSettings: getBrushSettingsValue
        };

        return (
            <Container>
                <MapDiv ref={mapDivRef} />
            </Container>
        );
    }
);

MapPainter.displayName = "MapPainter";
