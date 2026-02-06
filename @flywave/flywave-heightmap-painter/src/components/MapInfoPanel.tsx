import React from "react";
import styled from "styled-components";
import { GeoBox } from "../types";

interface MapInfoPanelProps {
    center: [number, number];
    zoom: number;
    geoBox: GeoBox | null;
    brushPosition?: { x: number; y: number; lat: number; lon: number } | null;
}

const PanelContainer = styled.div`
    position: absolute;
    top: 10px;
    right: 10px;
    width: 240px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    padding: 16px;
    z-index: 2000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const Title = styled.h3`
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
`;

const InfoItem = styled.div`
    margin-bottom: 8px;
`;

const Label = styled.div`
    font-size: 12px;
    font-weight: 600;
    color: #555;
    margin-bottom: 4px;
`;

const Value = styled.div`
    font-family: "Monaco", "Courier New", monospace;
    font-size: 12px;
    color: #333;
    line-height: 1.5;
`;

export const MapInfoPanel: React.FC<MapInfoPanelProps> = ({
    center,
    zoom,
    geoBox,
    brushPosition
}) => {
    return (
        <PanelContainer>
            <Title>地图信息</Title>

            <InfoItem>
                <Label>当前位置</Label>
                <Value>
                    <div>纬度: {center[0].toFixed(6)}°</div>
                    <div>经度: {center[1].toFixed(6)}°</div>
                    <div>缩放: {zoom}</div>
                </Value>
            </InfoItem>

            {brushPosition && (
                <>
                    <div
                        style={{ height: 8, borderBottom: "1px solid #e8e8e8", margin: "8px 0" }}
                    />
                    <InfoItem>
                        <Label>笔刷位置</Label>
                        <Value>
                            <div>X: {brushPosition.x.toFixed(1)}</div>
                            <div>Y: {brushPosition.y.toFixed(1)}</div>
                            <div>纬度: {brushPosition.lat.toFixed(6)}°</div>
                            <div>经度: {brushPosition.lon.toFixed(6)}°</div>
                        </Value>
                    </InfoItem>
                </>
            )}
        </PanelContainer>
    );
};
