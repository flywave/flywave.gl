import React from "react";
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

export const ExportPanel: React.FC<ExportPanelProps> = ({ onExport, exportData }) => {
    const previewUrl = exportData ? (exportData.imageData as HTMLCanvasElement).toDataURL() : null;

    return (
        <PanelContainer>
            <Title>📥 导出高程图</Title>

            {exportData && previewUrl && (
                <>
                    <PreviewContainer>
                        <PreviewImage src={previewUrl} alt="高程图预览" />
                        <PreviewLabel>灰度值: 0(黑)=低海拔, 255(白)=高海拔</PreviewLabel>
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
