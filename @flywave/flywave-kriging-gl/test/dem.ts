/* Copyright (C) 2025 flywave.gl contributors */

const demData = require("./dem.json");

const { position, extent, breaks } = demData;

export function getDEMData() {
    // 提取x, y坐标和高度值
    const x = position.map(p => p.x);
    const y = position.map(p => p.y);
    const values = position.map(p => p.value);

    return {
        x,
        y,
        values,
        position,
        extent,
        breaks
    };
}
