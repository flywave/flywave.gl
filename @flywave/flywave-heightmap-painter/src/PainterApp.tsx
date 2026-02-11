import React, { useState, forwardRef } from "react";
import styled from "styled-components";
import { Painter, PainterRef } from "./components/Painter";
import { ConfigPanel } from "./components/ConfigPanel";
import { BrushToolbar } from "./components/BrushToolbar";
import { ExportPanel } from "./components/ExportPanel";
import { HelpPanel, HelpButton } from "./components/HelpPanel";
import { MiniHelpPanel } from "./components/MiniHelpPanel";
import { HeightmapExport, BrushSettings, BrushType } from "./types";
import type { MapControls } from "@flywave/flywave.gl";
import type { MapView } from "@flywave/flywave.gl";

const Container = styled.div`
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;

    /* 允许交互的子元素 */
    > * {
        pointer-events: auto;
    }
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
    pointer-events: auto;
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

type AppState = "config" | "painting";

export interface AppProps {
    mapView: MapView;
    mapControls?: MapControls;
    width?: number;
    height?: number;
    paintAreaGeoBox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    onExport?: (data: HeightmapExport, format: "png" | "json") => void;
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
    reconfigure(): void;
}

const App = React.forwardRef<AppInstance, AppProps>(
    (
        {
            mapView,
            mapControls,
            width: propWidth,
            height: propHeight,
            paintAreaGeoBox,
            onExport,
            onBrushStart,
            onBrushMove,
            onBrushEnd,
            onHeightmapChange
        },
        ref
    ) => {
        const painterRef = React.useRef<PainterRef>(null);

        const [appState, setAppState] = useState<AppState>(paintAreaGeoBox ? "painting" : "config");

        const [currentWidth, setCurrentWidth] = useState(
            parseInt(sessionStorage.getItem("heightmap_output_width") || "1024")
        );
        const [currentHeight, setCurrentHeight] = useState(
            parseInt(sessionStorage.getItem("heightmap_output_height") || "1024")
        );
        const [currentGeoBox, setCurrentGeoBox] = useState<typeof paintAreaGeoBox>(
            paintAreaGeoBox || null
        );
        const [showExport, setShowExport] = useState(false);
        const [showHelp, setShowHelp] = useState(false);
        const [realtimeExportData, setRealtimeExportData] = useState<HeightmapExport | null>(null);
        const [brushSettings, setBrushSettings] = useState<BrushSettings>({
            type: BrushType.RAISE,
            size: 100,
            sizeUnit: "meters",
            strength: 0.5,
            hardness: 0.5,
            flattenHeight: 0.5
        });

        React.useImperativeHandle(ref, () => ({
            exportHeightmap: () => {
                return painterRef.current?.exportHeightmap() || null;
            },
            clearCanvas: () => painterRef.current?.clearCanvas(),
            updateBrushSettings: (settings: Partial<BrushSettings>) =>
                painterRef.current?.updateBrushSettings(settings),
            getBrushSettings: () => painterRef.current?.getBrushSettings(),
            reconfigure: () => setAppState("config")
        }));

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
            const exportData = painterRef.current?.exportHeightmap() || null;
            setRealtimeExportData(exportData);
            onHeightmapChange?.(heightData);
        };

        const handleStartPaint = (
            width: number,
            height: number,
            geoBox: {
                minLon: number;
                minLat: number;
                maxLon: number;
                maxLat: number;
            }
        ) => {
            setCurrentWidth(width);
            setCurrentHeight(height);
            setCurrentGeoBox(geoBox);
            setAppState("painting");
        };

        const handleReconfigure = () => {
            setAppState("config");
        };

        const handleBrushSettingsChange = (settings: Partial<BrushSettings>) => {
            setBrushSettings((prev: BrushSettings) => ({ ...prev, ...settings }));
        };

        const handleExport = (format: "png" | "json") => {
            const data = painterRef.current?.exportHeightmap();
            if (data) {
                onExport?.(data, format);
            }
        };

        if (appState === "config") {
            return (
                <Container>
                    <ConfigPanel
                        initialCenter={[mapView.target.latitude, mapView.target.longitude]}
                        initialZoom={mapView.zoomLevel}
                        basemap="satellite"
                        onStartPaint={handleStartPaint}
                    />
                </Container>
            );
        }

        if (!currentGeoBox) {
            return null;
        }

        return (
            <Container>
                <TopBar>
                    <Title>
                        🎨 地形编辑器 - {currentWidth}x{currentHeight}
                    </Title>
                    <ButtonGroup>
                        <HelpButton onClick={() => setShowHelp(true)} />
                        <Button $variant="default" onClick={handleReconfigure}>
                            ↩ 重新配置区域
                        </Button>
                        <Button $variant="primary" onClick={() => setShowExport(!showExport)}>
                            📤 导出
                        </Button>
                    </ButtonGroup>
                </TopBar>

                <Painter
                    ref={painterRef}
                    mapView={mapView}
                    width={currentWidth}
                    height={currentHeight}
                    paintAreaGeoBox={currentGeoBox}
                    onBrushStart={handleBrushStart}
                    onBrushMove={handleBrushMove}
                    onBrushEnd={handleBrushEnd}
                    onHeightmapChange={handleHeightmapChange}
                    mapControls={mapControls}
                />

                <BrushToolbar
                    brushSettings={brushSettings}
                    onSettingsChange={settings => {
                        painterRef.current?.updateBrushSettings(settings);
                        handleBrushSettingsChange(settings);
                    }}
                    onClear={() => painterRef.current?.clearCanvas()}
                />

                {showExport && (
                    <ExportPanel exportData={realtimeExportData} onExport={handleExport} />
                )}

                {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

                <MiniHelpPanel />
            </Container>
        );
    }
);

App.displayName = "App";

export default App;
