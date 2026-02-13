import React, { useState } from "react";
import styled from "styled-components";
import { HeightmapExport } from "../types";

interface ExportPanelProps {
    onExport: (format: "png" | "json") => void;
    exportData: HeightmapExport | null;
}

const PanelContainer = styled.div`
    position: absolute;
    bottom: 10px;
    left: 10px;
    width: 320px;
    background: rgba(20, 20, 20, 0.95);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    padding: 16px;
    z-index: 5000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
`;

const Title = styled.h3`
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 6px;
`;

const ButtonGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
`;

const Button = styled.button<{ $variant?: "primary" | "default" }>`
    padding: 10px 16px;
    border: 1px solid
        ${props =>
            props.$variant === "primary" ? "rgba(102, 126, 234, 0.5)" : "rgba(255, 255, 255, 0.2)"};
    background: ${props =>
        props.$variant === "primary"
            ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
            : "rgba(255, 255, 255, 0.05)"};
    color: ${props => (props.$variant === "primary" ? "#fff" : "#fff")};
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
    font-weight: 500;

    &:hover {
        opacity: 0.9;
        border-color: ${props =>
            props.$variant === "primary" ? "rgba(102, 126, 234, 0.8)" : "rgba(255, 255, 255, 0.3)"};
        background: ${props =>
            props.$variant === "primary"
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "rgba(255, 255, 255, 0.1)"};
        transform: translateY(-1px);
    }

    &:active {
        transform: translateY(0);
    }
`;

const InfoBox = styled.div`
    margin-top: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    font-size: 11px;
    border: 1px solid rgba(255, 255, 255, 0.1);
`;

const InfoLabel = styled.div`
    font-weight: 600;
    margin-bottom: 8px;
    color: #fff;
    font-size: 12px;
`;

const InfoValue = styled.div`
    font-family: "Monaco", "Courier New", monospace;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.7);
`;

const SizeInfo = styled.div`
    margin-top: 8px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
`;

const PreviewContainer = styled.div`
    margin-top: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
`;

const PreviewImage = styled.img`
    width: 100%;
    height: auto;
    display: block;
    image-rendering: pixelated;
`;

const PreviewLabel = styled.div`
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.5);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
`;

const HeightTooltip = styled.div<{ $visible: boolean; $x: number; $y: number }>`
    position: absolute;
    top: ${props => props.$y}px;
    left: ${props => props.$x}px;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 11px;
    color: #fff;
    pointer-events: none;
    z-index: 1000;
    opacity: ${props => (props.$visible ? 1 : 0)};
    transition: opacity 0.15s;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
`;

const decodeMapboxRGB = (r: number, g: number, b: number): number => {
    return (r * 256 * 256 + g * 256 + b) * 0.1 - 10000;
};

export const ExportPanel: React.FC<ExportPanelProps> = ({ onExport, exportData }) => {
    const [hoverInfo, setHoverInfo] = useState<{
        visible: boolean;
        x: number;
        y: number;
        height: number;
    }>({ visible: false, x: 0, y: 0, height: 0 });
    const previewUrl = exportData ? (exportData.imageData as HTMLCanvasElement).toDataURL() : null;

    const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!exportData) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pixelX = Math.floor((x / rect.width) * exportData.width);
        const pixelY = Math.floor((y / rect.height) * exportData.height);

        if (pixelX >= 0 && pixelX < exportData.width && pixelY >= 0 && pixelY < exportData.height) {
            const imageData = exportData.imageData;
            let height = 0;

            if (imageData instanceof HTMLCanvasElement) {
                const ctx = imageData.getContext("2d");
                if (ctx) {
                    const pixelData = ctx.getImageData(pixelX, pixelY, 1, 1).data;
                    height = decodeMapboxRGB(pixelData[0], pixelData[1], pixelData[2]);
                }
            } else {
                const index = (pixelY * exportData.width + pixelX) * 4;
                height = decodeMapboxRGB(
                    imageData.data[index],
                    imageData.data[index + 1],
                    imageData.data[index + 2]
                );
            }

            setHoverInfo({
                visible: true,
                x: x + 10,
                y: y - 30,
                height
            });
        }
    };

    const handleMouseLeave = () => {
        setHoverInfo(prev => ({ ...prev, visible: false }));
    };

    return (
        <PanelContainer>
            <Title>📥 导出高程图</Title>

            {exportData && previewUrl && (
                <>
                    <PreviewContainer>
                        <PreviewImage
                            src={previewUrl}
                            alt="高程图预览"
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        />
                        <PreviewLabel>Mapbox RGB编码 - 鼠标悬停查看高度值</PreviewLabel>
                        <HeightTooltip
                            $visible={hoverInfo.visible}
                            $x={hoverInfo.x}
                            $y={hoverInfo.y}
                        >
                            高度值: {hoverInfo.height}
                        </HeightTooltip>
                    </PreviewContainer>

                    <InfoBox>
                        <InfoLabel>📍 地理范围</InfoLabel>
                        <InfoValue>
                            <div>北: {exportData.geoBox.maxLat.toFixed(6)}°</div>
                            <div>南: {exportData.geoBox.minLat.toFixed(6)}°</div>
                            <div>东: {exportData.geoBox.maxLon.toFixed(6)}°</div>
                            <div>西: {exportData.geoBox.minLon.toFixed(6)}°</div>
                        </InfoValue>
                        <SizeInfo>
                            📐 尺寸: {exportData.width} x {exportData.height} px
                        </SizeInfo>
                    </InfoBox>
                </>
            )}

            <ButtonGroup>
                <Button $variant="primary" onClick={() => onExport("png")}>
                    📷 导出图片 (PNG)
                </Button>
                <Button onClick={() => onExport("json")}>📄 导出数据 (JSON)</Button>
            </ButtonGroup>
        </PanelContainer>
    );
};
