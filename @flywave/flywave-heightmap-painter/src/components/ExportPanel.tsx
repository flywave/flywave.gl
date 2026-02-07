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
    width: 280px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    padding: 16px;
    z-index: 5000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const Title = styled.h3`
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
`;

const ButtonGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
`;

const Button = styled.button<{ $variant?: "primary" | "default" }>`
    padding: 10px 16px;
    border: 1px solid ${props => (props.$variant === "primary" ? "#1890ff" : "#d9d9d9")};
    background: ${props => (props.$variant === "primary" ? "#1890ff" : "#fff")};
    color: ${props => (props.$variant === "primary" ? "#fff" : "#333")};
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;

    &:hover {
        opacity: 0.85;
        border-color: #40a9ff;
    }

    &:active {
        transform: scale(0.98);
    }
`;

const InfoBox = styled.div`
    margin-top: 12px;
    padding: 12px;
    background: #f5f5f5;
    border-radius: 4px;
    font-size: 11px;
`;

const InfoLabel = styled.div`
    font-weight: 600;
    margin-bottom: 6px;
    color: #333;
`;

const InfoValue = styled.div`
    font-family: "Monaco", "Courier New", monospace;
    line-height: 1.6;
    color: #666;
`;

const SizeInfo = styled.div`
    margin-top: 8px;
    font-size: 11px;
    color: #999;
`;

export const ExportPanel: React.FC<ExportPanelProps> = ({ onExport, exportData }) => {
    return (
        <PanelContainer>
            <Title>导出</Title>

            <div>
                导出格式
                <ButtonGroup>
                    <Button onClick={() => onExport("png")}>📷 导出图片 (PNG)</Button>
                    <Button onClick={() => onExport("json")}>📄 导出数据 (JSON)</Button>
                </ButtonGroup>
            </div>

            {exportData && (
                <>
                    <InfoBox>
                        <InfoLabel>地理范围</InfoLabel>
                        <InfoValue>
                            <div>北: {exportData.geoBox.maxLat.toFixed(6)}°</div>
                            <div>南: {exportData.geoBox.minLat.toFixed(6)}°</div>
                            <div>东: {exportData.geoBox.maxLon.toFixed(6)}°</div>
                            <div>西: {exportData.geoBox.minLon.toFixed(6)}°</div>
                        </InfoValue>
                    </InfoBox>

                    <SizeInfo>
                        尺寸: {exportData.width} x {exportData.height}
                    </SizeInfo>
                </>
            )}
        </PanelContainer>
    );
};
