import React, { useState } from "react";
import styled from "styled-components";

interface HelpPanelProps {
    onClose?: () => void;
}

const Overlay = styled.div<{ $visible: boolean }>`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 9998;
    display: ${props => (props.$visible ? "block" : "none")};
`;

const PanelContainer = styled.div<{ $visible: boolean }>`
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 450px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    background: linear-gradient(180deg, rgba(30, 30, 30, 0.98) 0%, rgba(20, 20, 20, 0.95) 100%);
    backdrop-filter: blur(20px);
    border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
    z-index: 9999;
    border: 1px solid rgba(255, 255, 255, 0.1);
    opacity: ${props => (props.$visible ? "1" : "0")};
    pointer-events: ${props => (props.$visible ? "auto" : "none")};
    transition: opacity 0.3s ease;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const Title = styled.h2`
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    font-size: 24px;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    width: 32px;
    height: 32px;
    border-radius: 8px;

    &:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 1);
    }
`;

const Content = styled.div`
    padding: 24px;
`;

const Section = styled.div`
    margin-bottom: 20px;

    &:last-child {
        margin-bottom: 0;
    }
`;

const SectionTitle = styled.h3`
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #667eea;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const KeyHint = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
`;

const Key = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    padding: 4px 10px;
    background: linear-gradient(180deg, rgba(60, 60, 60, 0.9) 0%, rgba(40, 40, 40, 0.9) 100%);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-family: "SF Mono", "Monaco", "Cascadia Code", monospace;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    margin-right: 10px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const Description = styled.span`
    flex: 1;
`;

const Highlight = styled.span`
    color: #667eea;
    font-weight: 600;
`;

const TipBox = styled.div`
    background: rgba(102, 126, 234, 0.1);
    border: 1px solid rgba(102, 126, 234, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 12px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.5;
`;

const Footer = styled.div`
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
`;

export const HelpPanel: React.FC<HelpPanelProps> = ({ onClose }) => {
    const [visible, setVisible] = useState(true);

    const handleClose = () => {
        setVisible(false);
        onClose?.();
    };

    return (
        <>
            <Overlay $visible={visible} onClick={handleClose} />
            <PanelContainer $visible={visible}>
                <Header>
                    <Title>📚 操作指南</Title>
                    <CloseButton onClick={handleClose}>×</CloseButton>
                </Header>

                <Content>
                    <Section>
                        <SectionTitle>绘制操作</SectionTitle>
                        <KeyHint>
                            <Key>空格</Key>
                            <Description>
                                按住 <Highlight>进入绘制模式</Highlight>，松开退出绘制模式
                            </Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>鼠标左键</Key>
                            <Description>在绘制模式下，按住鼠标左键拖动进行绘制</Description>
                        </KeyHint>
                        <TipBox>
                            💡 <strong>提示：</strong>
                            按住空格键后，会在鼠标位置显示笔刷光标，此时移动鼠标并按住左键即可绘制地形。
                        </TipBox>
                    </Section>

                    <Section>
                        <SectionTitle>笔刷类型</SectionTitle>
                        <KeyHint>
                            <Key>⬆️</Key>
                            <Description>提升笔刷 - 抬高地形</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>⬇️</Key>
                            <Description>降低笔刷 - 降低地形</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>〰️</Key>
                            <Description>平滑笔刷 - 平滑地形起伏</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>▬</Key>
                            <Description>平整笔刷 - 将地形平整到指定高度</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>✖️</Key>
                            <Description>噪声笔刷 - 添加随机噪声</Description>
                        </KeyHint>
                    </Section>

                    <Section>
                        <SectionTitle>笔刷设置</SectionTitle>
                        <KeyHint>
                            <Key>大小</Key>
                            <Description>调整笔刷的影响范围（支持米/像素单位）</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>强度</Key>
                            <Description>控制笔刷每次绘制的影响程度</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>硬度</Key>
                            <Description>控制笔刷边缘的柔和程度</Description>
                        </KeyHint>
                    </Section>

                    <Section>
                        <SectionTitle>其他操作</SectionTitle>
                        <KeyHint>
                            <Key>清空</Key>
                            <Description>清除所有已绘制的高程数据</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>导出</Key>
                            <Description>将高程图导出为 PNG 或 JSON 格式</Description>
                        </KeyHint>
                        <KeyHint>
                            <Key>重新配置</Key>
                            <Description>返回到区域选择界面重新设置绘制区域</Description>
                        </KeyHint>
                    </Section>
                </Content>

                <Footer>Flywave Heightmap Painter v1.0</Footer>
            </PanelContainer>
        </>
    );
};

export const HelpButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "10px 16px",
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.3s ease",
                display: "flex",
                alignItems: "center",
                gap: "6px"
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
            }}
        >
            ❓ 帮助
        </button>
    );
};
