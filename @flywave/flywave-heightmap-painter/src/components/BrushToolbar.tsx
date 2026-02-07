import React, { useState } from "react";
import styled from "styled-components";
import { BrushSettings, BrushType } from "../types";

interface BrushToolbarProps {
    brushSettings: BrushSettings;
    onSettingsChange: (settings: Partial<BrushSettings>) => void;
    onClear: () => void;
    mode: "draw" | "navigate";
    onModeChange: (mode: "draw" | "navigate") => void;
    disabled?: boolean;
}

const ToolbarContainer = styled.div<{ $disabled?: boolean }>`
    position: absolute;
    top: 70px;
    left: 10px;
    width: 260px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    background: linear-gradient(180deg, rgba(30, 30, 30, 0.98) 0%, rgba(20, 20, 20, 0.95) 100%);
    backdrop-filter: blur(20px);
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    padding: 12px;
    z-index: 2000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    opacity: ${props => (props.$disabled ? 0.5 : 1)};
    pointer-events: ${props => (props.$disabled ? "none" : "auto")};
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
`;

const Title = styled.h3`
    margin: 0 0 10px 0;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    text-align: center;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const CollapseButton = styled.button<{ $collapsed: boolean }>`
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 4px;
    font-size: 14px;
    transition: transform 0.3s ease;
    transform: ${props => (props.$collapsed ? "rotate(-90deg)" : "rotate(0deg)")};

    &:hover {
        color: rgba(255, 255, 255, 1);
    }
`;

const Section = styled.div<{ $collapsed?: boolean }>`
    margin-bottom: ${props => (props.$collapsed ? "0" : "8px")};
    overflow: ${props => (props.$collapsed ? "hidden" : "visible")};
    max-height: ${props => (props.$collapsed ? "0" : "none")};
    transition: all 0.3s ease;
`;

const Label = styled.label`
    display: block;
    margin-bottom: 4px;
    font-weight: 600;
    font-size: 11px;
    color: #e0e0e0;
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
`;

const Button = styled.button<{ $active?: boolean; $variant?: "primary" | "danger" | "default" }>`
    flex: 1;
    padding: 6px 10px;
    border: 1px solid
        ${props =>
            props.$active
                ? "rgba(102, 126, 234, 0.8)"
                : props.$variant === "danger"
                ? "rgba(245, 87, 108, 0.5)"
                : "rgba(255, 255, 255, 0.1)"};
    background: ${props =>
        props.$active
            ? "linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.8) 100%)"
            : props.$variant === "danger"
            ? "rgba(245, 87, 108, 0.1)"
            : "rgba(255, 255, 255, 0.05)"};
    color: ${props =>
        props.$active
            ? "#fff"
            : props.$variant === "danger"
            ? "#f5576c"
            : "rgba(255, 255, 255, 0.7)"};
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
        background: ${props =>
            props.$active
                ? "linear-gradient(135deg, rgba(102, 126, 234, 1) 0%, rgba(118, 75, 162, 1) 100%)"
                : props.$variant === "danger"
                ? "rgba(245, 87, 108, 0.2)"
                : "rgba(255, 255, 255, 0.1)"};
        border-color: ${props =>
            props.$active
                ? "rgba(102, 126, 234, 1)"
                : props.$variant === "danger"
                ? "rgba(245, 87, 108, 0.8)"
                : "rgba(255, 255, 255, 0.2)"};
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    &:active {
        transform: translateY(0);
    }
`;

const RangeContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const RangeInput = styled.input`
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    outline: none;

    &::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(102, 126, 234, 0.5);
        transition: transform 0.2s;
    }

    &::-webkit-slider-thumb:hover {
        transform: scale(1.2);
    }

    &::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 6px rgba(102, 126, 234, 0.5);
        transition: transform 0.2s;
    }

    &::-moz-range-thumb:hover {
        transform: scale(1.2);
    }
`;

const Divider = styled.div`
    height: 1px;
    background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.1) 50%,
        transparent 100%
    );
    margin: 10px 0;
`;

const GridContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 4px;
`;

const IconButton = styled.button<{ $active: boolean }>`
    padding: 6px 4px;
    border: 1px solid
        ${props => (props.$active ? "rgba(102, 126, 234, 0.8)" : "rgba(255, 255, 255, 0.1)")};
    background: ${props =>
        props.$active
            ? "linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.8) 100%)"
            : "rgba(255, 255, 255, 0.05)"};
    color: ${props => (props.$active ? "#fff" : "rgba(255, 255, 255, 0.7)")};
    border-radius: 6px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    &:hover {
        background: ${props =>
            props.$active
                ? "linear-gradient(135deg, rgba(102, 126, 234, 1) 0%, rgba(118, 75, 162, 1) 100%)"
                : "rgba(255, 255, 255, 0.1)"};
        border-color: ${props =>
            props.$active ? "rgba(102, 126, 234, 1)" : "rgba(255, 255, 255, 0.2)"};
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    &:active {
        transform: translateY(0);
    }
`;

export const BrushToolbar: React.FC<BrushToolbarProps> = ({
    brushSettings,
    onSettingsChange,
    onClear,
    mode,
    onModeChange,
    disabled = false
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const [settingsCollapsed, setSettingsCollapsed] = useState(true);

    const brushOptions = [
        { label: "提升", value: BrushType.RAISE, icon: "⬆️" },
        { label: "降低", value: BrushType.LOWER, icon: "⬇️" },
        { label: "平滑", value: BrushType.SMOOTH, icon: "〰️" },
        { label: "平整", value: BrushType.FLATTEN, icon: "▬" },
        { label: "噪声", value: BrushType.NOISE, icon: "✖️" }
    ];

    return (
        <ToolbarContainer $disabled={disabled}>
            <Title>
                <span>🎨 工具</span>
                <CollapseButton $collapsed={collapsed} onClick={() => setCollapsed(!collapsed)}>
                    ▼
                </CollapseButton>
            </Title>

            <Section $collapsed={collapsed}>
                <ButtonGroup>
                    <Button $active={mode === "draw"} onClick={() => onModeChange("draw")}>
                        🎨 绘制
                    </Button>
                    <Button $active={mode === "navigate"} onClick={() => onModeChange("navigate")}>
                        🗺️ 导航
                    </Button>
                </ButtonGroup>

                <Divider />

                <GridContainer>
                    {brushOptions.map(option => (
                        <IconButton
                            key={option.value}
                            $active={brushSettings.type === option.value}
                            onClick={() => onSettingsChange({ type: option.value as BrushType })}
                            title={`${option.label}笔刷`}
                        >
                            <div style={{ fontSize: "12px" }}>{option.icon}</div>
                            <div style={{ fontSize: "9px", marginTop: "2px" }}>{option.label}</div>
                        </IconButton>
                    ))}
                </GridContainer>

                <Divider />

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "8px"
                    }}
                >
                    <Label style={{ margin: 0 }}>高级设置</Label>
                    <CollapseButton
                        $collapsed={settingsCollapsed}
                        onClick={() => setSettingsCollapsed(!settingsCollapsed)}
                    >
                        ▼
                    </CollapseButton>
                </div>

                <Section $collapsed={settingsCollapsed}>
                    <Section>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: "4px"
                            }}
                        >
                            <Label style={{ margin: 0 }}>
                                笔刷大小: {brushSettings.size}
                                {brushSettings.sizeUnit === "meters" ? "m" : "px"}
                            </Label>
                            <select
                                value={brushSettings.sizeUnit}
                                onChange={e =>
                                    onSettingsChange({
                                        sizeUnit: e.target.value as "meters" | "pixels"
                                    })
                                }
                                style={{
                                    background: "rgba(255, 255, 255, 0.1)",
                                    border: "1px solid rgba(255, 255, 255, 0.2)",
                                    borderRadius: "4px",
                                    color: "#fff",
                                    padding: "2px 6px",
                                    fontSize: "10px",
                                    cursor: "pointer"
                                }}
                            >
                                <option value="pixels" style={{ color: "#000" }}>
                                    像素
                                </option>
                                <option value="meters" style={{ color: "#000" }}>
                                    米
                                </option>
                            </select>
                        </div>
                        <RangeContainer>
                            <RangeInput
                                type="range"
                                min={brushSettings.sizeUnit === "meters" ? 1 : 5}
                                max={brushSettings.sizeUnit === "meters" ? 1000 : 200}
                                value={brushSettings.size}
                                onChange={e => onSettingsChange({ size: parseInt(e.target.value) })}
                            />
                        </RangeContainer>
                    </Section>

                    <Section>
                        <Label>笔刷强度: {(brushSettings.strength * 100).toFixed(0)}%</Label>
                        <RangeContainer>
                            <RangeInput
                                type="range"
                                min={0.01}
                                max={1}
                                step={0.01}
                                value={brushSettings.strength}
                                onChange={e =>
                                    onSettingsChange({ strength: parseFloat(e.target.value) })
                                }
                            />
                        </RangeContainer>
                    </Section>

                    <Section>
                        <Label>笔刷硬度: {(brushSettings.hardness * 100).toFixed(0)}%</Label>
                        <RangeContainer>
                            <RangeInput
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={brushSettings.hardness}
                                onChange={e =>
                                    onSettingsChange({ hardness: parseFloat(e.target.value) })
                                }
                            />
                        </RangeContainer>
                    </Section>

                    {brushSettings.type === BrushType.FLATTEN && (
                        <Section>
                            <Label>
                                平整高度: {(brushSettings.flattenHeight! * 100).toFixed(0)}%
                            </Label>
                            <RangeContainer>
                                <RangeInput
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={brushSettings.flattenHeight!}
                                    onChange={e =>
                                        onSettingsChange({
                                            flattenHeight: parseFloat(e.target.value)
                                        })
                                    }
                                />
                            </RangeContainer>
                        </Section>
                    )}

                    <Divider />

                    <Button
                        $variant="danger"
                        onClick={onClear}
                        style={{ fontSize: "11px", padding: "8px" }}
                    >
                        🗑️ 清空
                    </Button>
                </Section>
            </Section>
        </ToolbarContainer>
    );
};
