import React from "react";
import styled from "styled-components";

const MiniHelpContainer = styled.div`
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(180deg, rgba(30, 30, 30, 0.95) 0%, rgba(20, 20, 20, 0.92) 100%);
    backdrop-filter: blur(20px);
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    padding: 14px 18px;
    z-index: 2000;
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const Title = styled.div`
    font-size: 12px;
    font-weight: 600;
    color: #667eea;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const KeyHint = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.85);

    &:last-child {
        margin-bottom: 0;
    }
`;

const KeyCombo = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    margin-right: 10px;
`;

const Key = styled.span<{ $highlight?: boolean }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    padding: 3px 8px;
    background: ${props =>
        props.$highlight
            ? "linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%)"
            : "linear-gradient(180deg, rgba(60, 60, 60, 0.9) 0%, rgba(40, 40, 40, 0.9) 100%)"};
    border: ${props =>
        props.$highlight
            ? "1px solid rgba(102, 126, 234, 0.5)"
            : "1px solid rgba(255, 255, 255, 0.15)"};
    border-radius: 5px;
    font-family: "SF Mono", "Monaco", "Cascadia Code", monospace;
    font-size: 11px;
    font-weight: 600;
    color: ${props => (props.$highlight ? "#a8b4ff" : "#fff")};
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
`;

const Plus = styled.span`
    color: rgba(255, 255, 255, 0.4);
    font-size: 10px;
    margin: 0 2px;
`;

const Highlight = styled.span`
    color: #667eea;
    font-weight: 600;
`;

const Description = styled.span`
    flex: 1;
`;

const Icon = styled.span`
    margin-right: 6px;
    font-size: 14px;
`;

export const MiniHelpPanel: React.FC = () => {
    return (
        <MiniHelpContainer>
            <Title>⚡ 快捷操作</Title>
            <KeyHint>
                <Icon>🖌️</Icon>
                <KeyCombo>
                    <Key $highlight>空格</Key>
                    <Plus>+</Plus>
                    <Key>左键</Key>
                </KeyCombo>
                <Description>
                    <Highlight>绘制地形</Highlight>
                </Description>
            </KeyHint>
            <KeyHint>
                <Icon>🗺️</Icon>
                <KeyCombo>
                    <Key>松开空格</Key>
                </KeyCombo>
                <Description>导航模式</Description>
            </KeyHint>
        </MiniHelpContainer>
    );
};
