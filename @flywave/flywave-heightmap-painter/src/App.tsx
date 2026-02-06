import React, { useState } from "react";
import styled from "styled-components";
import { ConfigPanel } from "./components/ConfigPanel";
import { PaintCanvas, PaintCanvasRef } from "./components/PaintCanvas";
import { BrushToolbar } from "./components/BrushToolbar";
import { HeightmapExport, BrushSettings } from "./types";

const Container = styled.div`
    width: 100%;
    height: 100%;
    position: relative;
    border: none;
    border-radius: 0;
    overflow: visible;
    background: #000;
`;

type AppState = "config" | "painting";

export interface AppProps {
    width?: number;
    height?: number;
    initialCenter?: [number, number];
    initialZoom?: number;
    basemap?: "satellite" | "street" | "terrain";
    paintAreaGeoBox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    onExport?: (data: HeightmapExport) => void;
    onBrushStart?: (x: number, y: number) => void;
    onBrushMove?: (x: number, y: number) => void;
    onBrushEnd?: () => void;
    onHeightmapChange?: (heightData: Float32Array) => void;
}

interface AppInstance {
    exportHeightmap(): HeightmapExport | null;
    clearCanvas(): void;
    updateBrushSettings(settings: Partial<BrushSettings>): void;
    getBrushSettings(): BrushSettings | null;
}

const App = React.forwardRef<AppInstance, AppProps>(
    (
        {
            width = 1024,
            height = 1024,
            initialCenter = [39.9, 116.4],
            initialZoom = 13,
            basemap = "satellite",
            paintAreaGeoBox,
            onExport,
            onBrushStart,
            onBrushMove,
            onBrushEnd,
            onHeightmapChange
        },
        ref
    ) => {
        const paintCanvasRef = React.useRef<PaintCanvasRef>(null);

        const [appState, setAppState] = useState<AppState>(paintAreaGeoBox ? "painting" : "config");

        const [currentWidth, setCurrentWidth] = useState(width);
        const [currentHeight, setCurrentHeight] = useState(height);
        const [currentGeoBox, setCurrentGeoBox] = useState<typeof paintAreaGeoBox>(
            paintAreaGeoBox || null
        );
        const [mode, setMode] = useState<"draw" | "navigate">("draw");

        React.useImperativeHandle(ref, () => ({
            exportHeightmap: () => {
                return paintCanvasRef.current?.exportHeightmap() || null;
            },
            clearCanvas: () => paintCanvasRef.current?.clearCanvas(),
            updateBrushSettings: (settings: Partial<BrushSettings>) =>
                paintCanvasRef.current?.updateBrushSettings(settings),
            getBrushSettings: () => paintCanvasRef.current?.getBrushSettings()
        }));

        const handleStartPaint = (
            newWidth: number,
            newHeight: number,
            geoBox: { minLon: number; minLat: number; maxLon: number; maxLat: number }
        ) => {
            setCurrentWidth(newWidth);
            setCurrentHeight(newHeight);
            setCurrentGeoBox(geoBox);
            setAppState("painting");
        };

        const handleReconfigure = () => {
            setAppState("config");
        };

        const handleExport = (data: HeightmapExport) => {
            onExport?.(data);
        };

        const handleBrushStart = (x: number, y: number) => {
            onBrushStart?.(x, y);
        };

        const handleBrushMove = (x: number, y: number) => {
            onBrushMove?.(x, y);
        };

        const handleBrushEnd = () => {
            onBrushEnd?.();
        };

        const handleHeightmapChange = (heightData: Float32Array) => {
            onHeightmapChange?.(heightData);
        };

        if (appState === "config") {
            return (
                <Container>
                    <ConfigPanel
                        initialCenter={initialCenter}
                        initialZoom={initialZoom}
                        basemap={basemap}
                        onStartPaint={handleStartPaint}
                    />
                </Container>
            );
        }

        // painting state
        if (!currentGeoBox) {
            return null;
        }

        return (
            <Container>
                <PaintCanvas
                    ref={paintCanvasRef}
                    width={currentWidth}
                    height={currentHeight}
                    initialCenter={initialCenter}
                    initialZoom={initialZoom}
                    basemap={basemap}
                    paintAreaGeoBox={currentGeoBox}
                    onReconfigure={handleReconfigure}
                    onExport={handleExport}
                    onBrushStart={handleBrushStart}
                    onBrushMove={handleBrushMove}
                    onBrushEnd={handleBrushEnd}
                    onHeightmapChange={handleHeightmapChange}
                    mode={mode}
                />

                <BrushToolbar
                    brushSettings={
                        paintCanvasRef.current?.getBrushSettings() || {
                            type: "raise" as any,
                            size: 50,
                            strength: 0.5,
                            hardness: 0.5,
                            flattenHeight: 0.5
                        }
                    }
                    onSettingsChange={settings =>
                        paintCanvasRef.current?.updateBrushSettings(settings)
                    }
                    onClear={() => paintCanvasRef.current?.clearCanvas()}
                    mode={mode}
                    onModeChange={setMode}
                />
            </Container>
        );
    }
);

App.displayName = "App";

export default App;
