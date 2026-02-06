import React, { useState } from "react";
import styled from "styled-components";
import { ConfigPanel } from "./components/ConfigPanel";
import { PaintCanvas, PaintCanvasRef } from "./components/PaintCanvas";
import { BrushToolbar } from "./components/BrushToolbar";
import { HeightmapExport, BrushSettings, BrushType } from "./types";

const Container = styled.div`
    width: 100%;
    height: 100%;
    position: relative;
    border: none;
    border-radius: 0;
    overflow: visible;
    background: #000;
`;

const ModalOverlay = styled.div<{ $show: boolean }>`
    display: ${props => (props.$show ? "flex" : "none")};
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    z-index: 5000;
    align-items: center;
    justify-content: center;
`;

const ModalContent = styled.div`
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
`;

const ModalTitle = styled.h2`
    margin: 0 0 16px 0;
    font-size: 20px;
    color: #333;
`;

const ImagePreview = styled.div`
    margin: 16px 0;
    text-align: center;
    background: #f5f5f5;
    padding: 16px;
    border-radius: 8px;
`;

const PreviewImage = styled.img`
    max-width: 100%;
    max-height: 60vh;
    border: 1px solid #ddd;
    border-radius: 4px;
`;

const InfoRow = styled.div`
    display: flex;
    justify-content: space-between;
    margin: 8px 0;
    padding: 8px;
    background: #f9f9f9;
    border-radius: 4px;
`;

const Label = styled.span`
    font-weight: 600;
    color: #666;
`;

const Value = styled.span`
    color: #333;
    font-family: monospace;
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 12px;
    margin-top: 16px;
`;

const Button = styled.button<{ $variant?: "primary" | "default" | "danger" }>`
    flex: 1;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    ${props =>
        props.$variant === "primary"
            ? `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
    `
            : props.$variant === "danger"
            ? `
        background: #f56565;
        color: white;
        &:hover {
            background: #e53e3e;
        }
    `
            : `
        background: #e2e8f0;
        color: #333;
        &:hover {
            background: #cbd5e0;
        }
    `}
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
        const [brushSettings, setBrushSettings] = useState<BrushSettings>({
            type: BrushType.RAISE,
            size: 50,
            strength: 0.5,
            hardness: 0.5,
            flattenHeight: 0.5
        });

        const [exportData, setExportData] = useState<HeightmapExport | null>(null);
        const [showExportModal, setShowExportModal] = useState(false);

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
            setExportData(data);
            setShowExportModal(true);
        };

        const handleDownloadExport = () => {
            if (!exportData) return;

            const canvas = exportData.imageData as HTMLCanvasElement;
            canvas.toBlob(blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `heightmap_${exportData.width}x${
                        exportData.height
                    }_${Date.now()}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            });
        };

        const handleCloseModal = () => {
            setShowExportModal(false);
            setExportData(null);
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

        const handleBrushSettingsChange = (settings: Partial<BrushSettings>) => {
            setBrushSettings((prev: BrushSettings) => ({ ...prev, ...settings }));
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
            <>
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
                        onBrushSettingsChange={handleBrushSettingsChange}
                        mode={mode}
                    />

                    <BrushToolbar
                        brushSettings={brushSettings}
                        onSettingsChange={settings => {
                            paintCanvasRef.current?.updateBrushSettings(settings);
                            handleBrushSettingsChange(settings);
                        }}
                        onClear={() => paintCanvasRef.current?.clearCanvas()}
                        mode={mode}
                        onModeChange={setMode}
                    />
                </Container>

                <ModalOverlay $show={showExportModal}>
                    <ModalContent>
                        <ModalTitle>📥 导出预览</ModalTitle>

                        {exportData && (
                            <>
                                <InfoRow>
                                    <Label>尺寸:</Label>
                                    <Value>
                                        {exportData.width} x {exportData.height} px
                                    </Value>
                                </InfoRow>
                                <InfoRow>
                                    <Label>最小经度:</Label>
                                    <Value>{exportData.geoBox.minLon.toFixed(6)}</Value>
                                </InfoRow>
                                <InfoRow>
                                    <Label>最小纬度:</Label>
                                    <Value>{exportData.geoBox.minLat.toFixed(6)}</Value>
                                </InfoRow>
                                <InfoRow>
                                    <Label>最大经度:</Label>
                                    <Value>{exportData.geoBox.maxLon.toFixed(6)}</Value>
                                </InfoRow>
                                <InfoRow>
                                    <Label>最大纬度:</Label>
                                    <Value>{exportData.geoBox.maxLat.toFixed(6)}</Value>
                                </InfoRow>

                                <ImagePreview>
                                    <PreviewImage
                                        src={(
                                            exportData.imageData as HTMLCanvasElement
                                        ).toDataURL()}
                                        alt="Heightmap preview"
                                    />
                                </ImagePreview>
                            </>
                        )}

                        <ButtonGroup>
                            <Button $variant="default" onClick={handleCloseModal}>
                                ✕ 关闭
                            </Button>
                            <Button $variant="primary" onClick={handleDownloadExport}>
                                📥 下载PNG
                            </Button>
                        </ButtonGroup>
                    </ModalContent>
                </ModalOverlay>
            </>
        );
    }
);

App.displayName = "App";

export default App;
