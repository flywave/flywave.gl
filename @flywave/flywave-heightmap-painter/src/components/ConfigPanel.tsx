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
    background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
    overflow: hidden;
`;

const Header = styled.div`
    flex-shrink: 0;
    background: linear-gradient(180deg, rgba(30, 30, 30, 0.98) 0%, rgba(20, 20, 20, 0.95) 100%);
    backdrop-filter: blur(10px);
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
`;

const Title = styled.h2`
    margin: 0 0 12px 0;
    font-size: 24px;
    font-weight: 700;
    color: #fff;
`;

const FormSection = styled.div`
    margin-bottom: 12px;
`;

const SectionLabel = styled.label`
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
`;

const SubSectionLabel = styled.label`
    display: block;
    font-size: 13px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.6);
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
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
`;

const Input = styled.input`
    width: 100%;
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-size: 14px;
    transition: all 0.3s;

    &:focus {
        outline: none;
        border-color: rgba(102, 126, 234, 0.8);
        background: rgba(255, 255, 255, 0.1);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
    }

    &::placeholder {
        color: rgba(255, 255, 255, 0.4);
    }
`;

const MapContainer = styled.div`
    flex: 1;
    min-height: 300px;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    margin: 0 20px 20px 20px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
`;

const MapDiv = styled.div`
    width: 100%;
    height: 100%;
`;

const GeoBoxDisplay = styled.div`
    flex-shrink: 0;
    background: linear-gradient(180deg, rgba(30, 30, 30, 0.98) 0%, rgba(20, 20, 20, 0.95) 100%);
    backdrop-filter: blur(10px);
    padding: 20px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-family: "Courier New", monospace;
    font-size: 13px;
`;

const InfoBox = styled.div`
    background: rgba(102, 126, 234, 0.15);
    border: 1px solid rgba(102, 126, 234, 0.4);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
`;

const InfoRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
`;

const Label = styled.span`
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    display: block;
    margin-bottom: 6px;
`;

const Value = styled.span`
    font-family: monospace;
    color: #fff;
`;

const ButtonRow = styled.div`
    display: flex;
    gap: 12px;
    margin-top: 16px;
`;

const Button = styled.button<{ $variant?: "primary" | "default" }>`
    flex: 1;
    padding: 12px 24px;
    border: none;
    border-radius: 10px;
    font-size: 15px;
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
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }
        &:active {
            transform: translateY(0);
        }
        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
    `
            : `
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        &:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.3);
        }
        &:active {
            transform: translateY(0);
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

    const [outputWidth, setOutputWidth] = useState("1024");
    const [outputHeight, setOutputHeight] = useState("1024");

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
            // eslint-disable-next-line no-console
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

        return {
            width: Math.max(64, pixelWidth),
            height: Math.max(64, pixelHeight)
        };
    }, [currentGeoBox, mapZoom]);

    const handleStartPaint = useCallback(() => {
        if (!currentGeoBox) return;

        const width = parseInt(outputWidth);
        const height = parseInt(outputHeight);

        if (isNaN(width) || isNaN(height) || width < 64 || height < 64) {
            alert("Please enter valid width and height (min 64px)");
            return;
        }

        onStartPaint(width, height, currentGeoBox);
    }, [currentGeoBox, outputWidth, outputHeight, onStartPaint]);

    return (
        <Container>
            <Header>
                <Title>📍 配置绘制区域</Title>

                <FormSection>
                    <SectionLabel>地图范围设置</SectionLabel>
                    <SubSectionLabel>拖动蓝色矩形框或手动输入坐标</SubSectionLabel>
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

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "8px 16px",
                                marginBottom: "16px"
                            }}
                        >
                            <div>
                                <Label>输出宽度（像素）</Label>
                                <Input
                                    type="number"
                                    min="64"
                                    max="8192"
                                    placeholder="1024"
                                    value={outputWidth}
                                    onChange={e => setOutputWidth(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>输出高度（像素）</Label>
                                <Input
                                    type="number"
                                    min="64"
                                    max="8192"
                                    placeholder="1024"
                                    value={outputHeight}
                                    onChange={e => setOutputHeight(e.target.value)}
                                />
                            </div>
                        </div>
                    </>
                )}

                <ButtonRow>
                    <Button $variant="primary" onClick={handleStartPaint} disabled={!currentGeoBox}>
                        ✅ 开始绘制
                    </Button>
                </ButtonRow>
            </GeoBoxDisplay>
        </Container>
    );
};
