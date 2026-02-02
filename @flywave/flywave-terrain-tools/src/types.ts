/* Copyright (C) 2025 flywave.gl contributors */

import { MapView } from "@flywave/flywave-mapview";
import { DEMTerrainSource, BrushOperation } from "@flywave/flywave-terrain-datasource";

/**
 * 用户笔刷配置接口
 * 所有参数都是可选的，用于简化UI输入
 */
export interface BrushConfig {
    type?: "raise" | "lower" | "smooth" | "flatten" | "noise" | "erode";
    radius?: number;
    hardness?: number;
    heightDelta?: number;
    strength?: number;
    targetAltitude?: number;
    scale?: number;
    persistence?: number;
    dragEnabled?: boolean;
    dragSpacing?: number;
    blendMode?: "normal" | "add" | "multiply" | "screen" | "overlay";
}

/**
 * 地形工具选项
 */
export interface TerrainToolsOptions {
    mapView: MapView;
    demTerrainSource?: DEMTerrainSource;
    uiContainer?: HTMLElement | string;
    showUI?: boolean;
    defaultBrush?: Partial<BrushConfig>;
    defaultEnabled?: boolean;
    onOperationAdded?: (id: string, operation: BrushOperation) => void;
    onOperationRemoved?: (id: string) => void;
}

/**
 * 导出的地形数据格式
 */
export interface ExportedTerrainData {
    version: string;
    timestamp: string;
    metadata: {
        totalOperations: number;
        bounds: {
            minLat: number;
            maxLat: number;
            minLon: number;
            maxLon: number;
        };
    };
    operations: Array<{
        id: string;
        position: { lat: number; lon: number; alt: number };
        settings: any;
    }>;
}
