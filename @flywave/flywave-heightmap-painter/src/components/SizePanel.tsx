import React from "react";
import styled from "styled-components";

interface SizePanelProps {
    width: number;
    height: number;
    hasDrawingData: boolean;
    onSizeChange: (width: number, height: number) => void;
}

const Panel = styled.div`
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    padding: 16px;
    z-index: 2000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-width: 200px;
`;

const Title = styled.h3`
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #333;
`;

const InputRow = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
`;

const InputGroup = styled.div`
    flex: 1;
`;

const InputLabel = styled.label`
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: #555;
    font-weight: 600;
`;

const Input = styled.input`
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    font-size: 13px;

    &:focus {
        outline: none;
        border-color: #1890ff;
    }
`;

const ApplyButton = styled.button`
    width: 100%;
    padding: 8px;
    background: #1890ff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;

    &:hover {
        background: #40a9ff;
    }

    &:disabled {
        background: #d9d9d9;
        cursor: not-allowed;
    }
`;

export const SizePanel: React.FC<SizePanelProps> = ({
    width,
    height,
    hasDrawingData,
    onSizeChange
}) => {
    const [tempWidth, setTempWidth] = React.useState(width);
    const [tempHeight, setTempHeight] = React.useState(height);

    const handleApply = () => {
        if (hasDrawingData) {
            const confirmed = window.confirm("警告：修改画布尺寸将清除当前的绘制数据！是否继续？");
            if (!confirmed) return;
        }

        if (tempWidth !== width || tempHeight !== height) {
            onSizeChange(tempWidth, tempHeight);
        }
    };

    return (
        <Panel>
            <Title>输出尺寸</Title>
            <InputRow>
                <InputGroup>
                    <InputLabel>宽度</InputLabel>
                    <Input
                        type="number"
                        min={256}
                        max={4096}
                        step={64}
                        value={tempWidth}
                        onChange={e => setTempWidth(parseInt(e.target.value) || width)}
                    />
                </InputGroup>
                <InputGroup>
                    <InputLabel>高度</InputLabel>
                    <Input
                        type="number"
                        min={256}
                        max={4096}
                        step={64}
                        value={tempHeight}
                        onChange={e => setTempHeight(parseInt(e.target.value) || height)}
                    />
                </InputGroup>
            </InputRow>
            <ApplyButton onClick={handleApply}>应用尺寸</ApplyButton>
        </Panel>
    );
};
