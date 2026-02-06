import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import L from "leaflet";
import styled from "styled-components";

import "@jonatanheyman/leaflet-areaselect";

interface ConfigPanelProps {
    initialCenter: [number, number];
    initialZoom: number;
    basemap: "satellite" | "street" | "terrain";
    onStartPaint: (
        width: number,
        height: number,
        geoBox: {
            minLon: number;
            minLat: number;
            maxLon: number;
            maxLat: number;
        }
    ) => void;
}

interface GeoBoxInput {
    minLon: string;
    minLat: string;
    maxLon: string;
    maxLat: string;
}

const Container = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #f5f5f5;
    overflow: hidden;
`;

const Header = styled.div`
    flex-shrink: 0;
    background: white;
    padding: 16px 20px;
    border-bottom: 1px solid #e0e0e0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const Title = styled.h2`
    margin: 0 0 16px 0;
    font-size: 20px;
    color: #333;
`;

const FormSection = styled.div`
    margin-bottom: 16px;
`;

const SectionLabel = styled.label`
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #555;
`;

const InputRow = styled.div`
    display: flex;
    gap: 12px;
    align-items: center;
`;

const InputGroup = styled.div`
    flex: 1;
`;

const InputLabel = styled.label`
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: #666;
`;

const Input = styled.input`
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    font-size: 14px;

    &:focus {
        outline: none;
        border-color: #1890ff;
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
    }
`;

const MapContainer = styled.div`
    flex: 1;
    min-height: 200px;
    position: relative;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    background: white;
    margin: 0 16px 16px 16px;
`;

const MapDiv = styled.div`
    width: 100%;
    height: 100%;
`;

const GeoBoxDisplay = styled.div`
    flex-shrink: 0;
    background: white;
    padding: 16px 24px;
    border-top: 1px solid #e0e0e0;
    font-family: "Courier New", monospace;
    font-size: 12px;
`;

const InfoBox = styled.div`
    background: #f0f5ff;
    border: 1px solid #adc6ff;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
`;

const InfoRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 13px;
`;

const Label = styled.span`
    font-weight: 600;
    color: #595959;
    font-size: 13px;
    display: block;
    margin-bottom: 4px;
`;

const Value = styled.span`
    font-family: monospace;
    color: #262626;
`;

const ButtonRow = styled.div`
    display: flex;
    gap: 12px;
    margin-top: 16px;
`;

const Button = styled.button<{ $variant?: "primary" | "default" }>`
    flex: 1;
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    ${props =>
        props.$variant === "primary"
            ? `
        background: #1890ff;
        color: white;
        &:hover {
            background: #40a9ff;
        }
    `
            : `
        background: white;
        color: #333;
        border: 1px solid #d0d0d0;
        &:hover {
            border-color: #1890ff;
            color: #1890ff;
        }
    `}
`;

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
    initialCenter,
    initialZoom,
    basemap,
    onStartPaint
}) => {
    const mapRef = useRef<L.Map | null>(null);
    const mapDivRef = useRef<HTMLDivElement>(null);
    const areaSelectRef = useRef<any>(null);

    const [currentGeoBox, setCurrentGeoBox] = useState<{
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    } | null>(null);

    const [geoBoxInput, setGeoBoxInput] = useState<GeoBoxInput>({
        minLon: "",
        minLat: "",
        maxLon: "",
        maxLat: ""
    });

    const [mapZoom, setMapZoom] = useState(0);

    useEffect(() => {
        if (!mapDivRef.current) return;

        const map = L.map(mapDivRef.current, {
            center: initialCenter,
            zoom: initialZoom,
            zoomControl: true
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

        const areaSelect = (L as any).areaSelect({
            width: 500,
            height: 500,
            keepAspectRatio: false
        });

        areaSelect.addTo(map);

        areaSelectRef.current = areaSelect;

        areaSelect.on("change", () => {
            updateGeoBoxFromAreaSelect();
        });

        updateGeoBoxFromAreaSelect();

        const updateZoom = () => {
            setMapZoom(map.getZoom());
        };

        map.on("zoomend", updateZoom);
        setMapZoom(map.getZoom());

        return () => {
            map.off("zoomend", updateZoom);
            map.remove();
        };
    }, []);

    const updateGeoBoxFromAreaSelect = useCallback(() => {
        if (!areaSelectRef.current) return;

        const bounds = areaSelectRef.current.getBounds();
        if (!bounds) return;

        const geoBox = {
            minLon: bounds.getSouthWest().lng,
            minLat: bounds.getSouthWest().lat,
            maxLon: bounds.getNorthEast().lng,
            maxLat: bounds.getNorthEast().lat
        };

        setCurrentGeoBox(geoBox);

        setGeoBoxInput({
            minLon: geoBox.minLon.toFixed(6),
            minLat: geoBox.minLat.toFixed(6),
            maxLon: geoBox.maxLon.toFixed(6),
            maxLat: geoBox.maxLat.toFixed(6)
        });
    }, []);

    const handleGeoBoxInputChange = useCallback((field: keyof GeoBoxInput, value: string) => {
        setGeoBoxInput(prev => ({
            ...prev,
            [field]: value
        }));
    }, []);

    const handleGeoBoxInputBlur = useCallback(() => {
        const numMinLon = parseFloat(geoBoxInput.minLon);
        const numMinLat = parseFloat(geoBoxInput.minLat);
        const numMaxLon = parseFloat(geoBoxInput.maxLon);
        const numMaxLat = parseFloat(geoBoxInput.maxLat);

        if (isNaN(numMinLon) || isNaN(numMinLat) || isNaN(numMaxLon) || isNaN(numMaxLat)) {
            return;
        }

        if (!areaSelectRef.current) return;

        try {
            const newBounds = L.latLngBounds([numMinLat, numMinLon], [numMaxLat, numMaxLon]);

            areaSelectRef.current.setBounds(newBounds);

            const geoBox = {
                minLon: newBounds.getSouthWest().lng,
                minLat: newBounds.getSouthWest().lat,
                maxLon: newBounds.getNorthEast().lng,
                maxLat: newBounds.getNorthEast().lat
            };

            setCurrentGeoBox(geoBox);
        } catch (e) {
            console.warn("Failed to update bounds:", e);
        }
    }, [geoBoxInput]);

    const canvasSize = useMemo(() => {
        if (!currentGeoBox || !mapRef.current) return null;

        const map = mapRef.current;
        const bounds = L.latLngBounds(
            [currentGeoBox.minLat, currentGeoBox.minLon],
            [currentGeoBox.maxLat, currentGeoBox.maxLon]
        );

        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();

        const min = map.latLngToLayerPoint(southWest);
        const max = map.latLngToLayerPoint(northEast);

        const pixelWidth = Math.round(Math.abs(max.x - min.x));
        const pixelHeight = Math.round(Math.abs(max.y - min.y));

        console.log("Canvas size calculation:", {
            southWest: [southWest.lat, southWest.lng],
            northEast: [northEast.lat, northEast.lng],
            min: [min.x, min.y],
            max: [max.x, max.y],
            pixelWidth,
            pixelHeight,
            finalWidth: Math.max(64, pixelWidth),
            finalHeight: Math.max(64, pixelHeight)
        });

        return {
            width: Math.max(64, pixelWidth),
            height: Math.max(64, pixelHeight)
        };
    }, [currentGeoBox, mapZoom]);

    const handleStartPaint = useCallback(() => {
        if (!currentGeoBox || !mapRef.current) return;

        const map = mapRef.current;
        const zoom = map.getZoom();
        const bounds = L.latLngBounds(
            [currentGeoBox.minLat, currentGeoBox.minLon],
            [currentGeoBox.maxLat, currentGeoBox.maxLon]
        );

        const min = map.latLngToLayerPoint(bounds.getSouthWest());
        const max = map.latLngToLayerPoint(bounds.getNorthEast());

        const pixelWidth = Math.round(Math.abs(max.x - min.x));
        const pixelHeight = Math.round(Math.abs(max.y - min.y));

        const width = Math.max(64, pixelWidth);
        const height = Math.max(64, pixelHeight);

        console.log("handleStartPaint:", {
            min: [min.x, min.y],
            max: [max.x, max.y],
            pixelWidth,
            pixelHeight,
            width,
            height
        });

        onStartPaint(width, height, currentGeoBox);
    }, [currentGeoBox, onStartPaint]);

    return (
        <Container>
            <Header>
                <Title>Heightmap Painter - 配置</Title>

                <FormSection>
                    <SectionLabel>地图范围设置</SectionLabel>
                    <SectionLabel style={{ fontWeight: "normal", fontSize: "13px", color: "#666" }}>
                        拖动蓝色矩形框或手动输入坐标
                    </SectionLabel>
                </FormSection>
            </Header>

            <MapContainer>
                <MapDiv ref={mapDivRef} />
            </MapContainer>

            <GeoBoxDisplay>
                {currentGeoBox && (
                    <>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "8px 16px",
                                marginBottom: "16px"
                            }}
                        >
                            <div>
                                <Label>最小经度</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={geoBoxInput.minLon}
                                    onChange={e =>
                                        handleGeoBoxInputChange("minLon", e.target.value)
                                    }
                                    onBlur={handleGeoBoxInputBlur}
                                />
                            </div>
                            <div>
                                <Label>最小纬度</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={geoBoxInput.minLat}
                                    onChange={e =>
                                        handleGeoBoxInputChange("minLat", e.target.value)
                                    }
                                    onBlur={handleGeoBoxInputBlur}
                                />
                            </div>
                            <div>
                                <Label>最大经度</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={geoBoxInput.maxLon}
                                    onChange={e =>
                                        handleGeoBoxInputChange("maxLon", e.target.value)
                                    }
                                    onBlur={handleGeoBoxInputBlur}
                                />
                            </div>
                            <div>
                                <Label>最大纬度</Label>
                                <Input
                                    type="number"
                                    step="0.000001"
                                    value={geoBoxInput.maxLat}
                                    onChange={e =>
                                        handleGeoBoxInputChange("maxLat", e.target.value)
                                    }
                                    onBlur={handleGeoBoxInputBlur}
                                />
                            </div>
                        </div>

                        {canvasSize && (
                            <div
                                style={{
                                    marginBottom: "16px",
                                    padding: "12px",
                                    background: "rgba(102, 126, 234, 0.1)",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(102, 126, 234, 0.3)"
                                }}
                            >
                                <div
                                    style={{
                                        fontWeight: 600,
                                        color: "#667eea",
                                        marginBottom: "4px"
                                    }}
                                >
                                    输出尺寸: {canvasSize.width} x {canvasSize.height}
                                </div>
                            </div>
                        )}
                    </>
                )}

                <ButtonRow>
                    <Button $variant="primary" onClick={handleStartPaint} disabled={!currentGeoBox}>
                        ✓ 开始绘制
                    </Button>
                </ButtonRow>
            </GeoBoxDisplay>
        </Container>
    );
};
