/* Copyright (C) 2025 flywave.gl contributors */

import { MapView } from "@flywave/flywave-mapview";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import {
    DEMTerrainSource,
    type BrushOperation,
    BrushType
} from "@flywave/flywave-terrain-datasource";
import * as THREE from "three";

import { BrushManager } from "./BrushManager";
import { OperationManager } from "./OperationManager";
import { TerrainControlPointManager } from "./TerrainControlPointManager";
import { TerrainToolsGUI, type TerrainToolsGUIOptions } from "../ui/TerrainToolsGUI";
import { DataExporter } from "../data/DataExporter";

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
}

export type ToolMode = "brush" | "control";

export interface TerrainToolsOptions {
    mapView: MapView;
    demTerrainSource: DEMTerrainSource;
    uiContainer?: HTMLElement | string;
    showUI?: boolean;
    defaultEnabled?: boolean;
    defaultBrush?: Partial<BrushConfig>;
    defaultMode?: ToolMode;
    onOperationAdded?: (id: string, operation: BrushOperation) => void;
    onOperationRemoved?: (id: string) => void;
    onControlPointAdded?: (point: any) => void;
    onControlPointRemoved?: (id: number) => void;
    onControlPointSelected?: (point: any | null) => void;
}

export class TerrainTools {
    private mapView: MapView;
    private demTerrain: DEMTerrainSource;
    private brushManager: BrushManager;
    private operationManager: OperationManager;
    private controlPointManager: TerrainControlPointManager;
    private ui: TerrainToolsGUI | null = null;
    private isToolEnabled: boolean = false;
    private operationIds: string[] = [];
    private isMouseDown: boolean = false;
    private lastDragPosition: GeoCoordinates | null = null;
    private options: TerrainToolsOptions;
    private currentMode: ToolMode = "brush";

    private mouseDownHandler: ((e: MouseEvent) => void) | null = null;
    private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    private mouseUpHandler: ((e: MouseEvent) => void) | null = null;
    private clickHandler: ((e: MouseEvent) => void) | null = null;

    constructor(options: TerrainToolsOptions) {
        this.options = options;
        this.mapView = options.mapView;
        this.currentMode = options.defaultMode || "brush";

        if (options.demTerrainSource) {
            this.demTerrain = options.demTerrainSource;
        } else {
            throw new Error("DEMTerrainSource not provided. Please provide it in options.");
        }

        this.brushManager = new BrushManager(options.defaultBrush);
        this.operationManager = new OperationManager();
        this.controlPointManager = new TerrainControlPointManager(this.mapView);

        this.setupControlPointListeners();

        if (options.showUI !== false) {
            this.createUI(options.uiContainer);
        }

        if (options.defaultEnabled !== false) {
            this.enable();
        }
    }

    private setupControlPointListeners(): void {
        this.controlPointManager.addEventListener("pointAdded", (event: any) => {
            if (this.options.onControlPointAdded) {
                this.options.onControlPointAdded(event.point);
            }
        });

        this.controlPointManager.addEventListener("pointRemoved", (event: any) => {
            if (this.options.onControlPointRemoved) {
                this.options.onControlPointRemoved(event.point.id);
            }
        });

        this.controlPointManager.addEventListener("pointSelected", (event: any) => {
            if (this.options.onControlPointSelected) {
                this.options.onControlPointSelected(event.point);
            }
        });
    }

    private createUI(container?: HTMLElement | string): void {
        const uiOptions: TerrainToolsGUIOptions = {
            onBrushChange: (brush: Partial<BrushConfig>) => {
                this.brushManager.setConfig(brush);
            },
            onExport: (format: "json" | "clipboard") => {
                this.handleExport(format);
            },
            onClear: () => {
                this.clearOperations();
            },
            onToggle: (enabled: boolean) => {
                if (enabled) {
                    this.enable();
                } else {
                    this.disable();
                }
            },
            defaultBrush: this.options.defaultBrush
        };

        this.ui = new TerrainToolsGUI(uiOptions);
    }

    enable(): void {
        if (this.isToolEnabled) {
            console.log("⚠️ 工具已经启用，无需重复启用");
            return;
        }

        if (!this.mapView) {
            throw new Error("MapView not initialized");
        }

        const canvas = this.mapView.renderer.domElement;
        console.log("🔧 正在启用地形工具...");
        console.log("📌 Canvas 元素:", canvas);

        this.mouseDownHandler = (e: MouseEvent) => this.handleMouseDown(e);
        this.mouseMoveHandler = (e: MouseEvent) => this.handleMouseMove(e);
        this.mouseUpHandler = (e: MouseEvent) => this.handleMouseUp(e);
        this.clickHandler = (e: MouseEvent) => this.handleClick(e);

        canvas.addEventListener("mousedown", this.mouseDownHandler);
        canvas.addEventListener("mousemove", this.mouseMoveHandler);
        canvas.addEventListener("mouseup", this.mouseUpHandler);
        canvas.addEventListener("click", this.clickHandler);

        this.isToolEnabled = true;

        console.log("✅ 地形工具已启用");
        console.log("📍 当前模式:", this.currentMode);
        console.log("🖱️ 事件监听器已添加到 canvas");

        if (this.ui) {
            this.ui.setEnabledState(true);
            console.log("🎨 UI 状态已更新");
        }
    }

    disable(): void {
        if (!this.isToolEnabled) {
            return;
        }

        if (!this.mapView) {
            return;
        }

        const canvas = this.mapView.renderer.domElement;

        if (this.mouseDownHandler) {
            canvas.removeEventListener("mousedown", this.mouseDownHandler);
        }
        if (this.mouseMoveHandler) {
            canvas.removeEventListener("mousemove", this.mouseMoveHandler);
        }
        if (this.mouseUpHandler) {
            canvas.removeEventListener("mouseup", this.mouseUpHandler);
        }
        if (this.clickHandler) {
            canvas.removeEventListener("click", this.clickHandler);
        }

        this.isToolEnabled = false;

        if (this.ui) {
            this.ui.setEnabledState(false);
        }
    }

    setMode(mode: ToolMode): void {
        this.currentMode = mode;

        if (mode === "control") {
            this.controlPointManager.setAddingMode(true);
        } else {
            this.controlPointManager.setAddingMode(false);
        }
    }

    getMode(): ToolMode {
        return this.currentMode;
    }

    private handleClick(e: MouseEvent): void {
        if (!this.isToolEnabled) {
            console.warn("⚠️ 工具未启用，忽略点击事件");
            return;
        }

        if (this.currentMode !== "control") {
            console.log("ℹ️ 当前模式:", this.currentMode, "- 不是控制点模式，忽略点击");
            return;
        }

        console.log("🖱️ 控制点模式：点击事件触发");

        const coords = this.getCoordinatesFromMouseEvent(e);
        if (!coords) {
            console.warn("⚠️ 无法获取地理坐标");
            return;
        }

        const rect = this.mapView.renderer.domElement.getBoundingClientRect();
        const mousePoint = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        const existingPoint = this.controlPointManager.findPointAt(mousePoint);

        if (existingPoint) {
            console.log("✅ 选中现有控制点:", existingPoint.id);
            this.controlPointManager.selectPoint(existingPoint.id);
        } else {
            console.log("➕ 添加新控制点");
            const currentBrushConfig = this.brushManager.getConfig();
            const point = this.controlPointManager.addPoint(coords, {
                brushType: (currentBrushConfig.type as any) || "raise",
                radius: currentBrushConfig.radius || 80,
                hardness: currentBrushConfig.hardness || 0.5,
                heightDelta: currentBrushConfig.heightDelta || 10,
                strength: currentBrushConfig.strength || 0.5,
                targetAltitude: currentBrushConfig.targetAltitude || 100,
                scale: currentBrushConfig.scale || 8,
                persistence: currentBrushConfig.persistence || 0.5
            });
            console.log("✅ 控制点已创建，ID:", point.id);
            this.controlPointManager.selectPoint(point.id);
        }
    }

    private handleMouseDown(e: MouseEvent): void {
        if (!this.isToolEnabled) {
            console.warn("⚠️ 工具未启用，忽略鼠标事件");
            return;
        }

        if (!this.demTerrain) {
            console.warn("⚠️ DEM 地形源未初始化，忽略鼠标事件");
            return;
        }

        console.log("🖱️ 鼠标按下事件触发");
        this.isMouseDown = true;

        const coords = this.getCoordinatesFromMouseEvent(e);
        if (!coords) {
            console.warn("⚠️ 无法获取地理坐标");
            return;
        }

        console.log("📍 坐标:", coords.latitude.toFixed(6), coords.longitude.toFixed(6));

        const brushSettings = this.brushManager.toBrushSettings();
        const operation: BrushOperation = {
            position: coords,
            settings: brushSettings
        };

        console.log("🎨 添加笔刷操作，类型:", brushSettings.type);

        const id = this.demTerrain.getGroundModificationManager().addOperation(operation);
        this.operationIds.push(id);
        this.operationManager.addOperation(operation);

        console.log("✅ 操作已添加，ID:", id);

        if (this.options.onOperationAdded) {
            this.options.onOperationAdded(id, operation);
        }

        if (this.ui) {
            this.ui.updateOperationCount(this.getOperationCount());
        }
    }

    private handleMouseMove(e: MouseEvent): void {
        if (!this.isToolEnabled || !this.isMouseDown) {
            return;
        }

        const coords = this.getCoordinatesFromMouseEvent(e);
        if (!coords) {
            return;
        }

        if (this.brushManager.getConfig().dragEnabled) {
            const shouldApply = this.checkDragSpacing(coords);

            if (shouldApply) {
                this.lastDragPosition = coords;

                const brushSettings = this.brushManager.toBrushSettings();
                const operation: BrushOperation = {
                    position: coords,
                    settings: brushSettings
                };

                const id = this.demTerrain.getGroundModificationManager().addOperation(operation);
                this.operationIds.push(id);
                this.operationManager.addOperation(operation);

                if (this.options.onOperationAdded) {
                    this.options.onOperationAdded(id, operation);
                }

                if (this.ui) {
                    this.ui.updateOperationCount(this.getOperationCount());
                }
            }
        }
    }

    private handleMouseUp(e: MouseEvent): void {
        this.isMouseDown = false;
        this.lastDragPosition = null;
    }

    private checkDragSpacing(coords: GeoCoordinates): boolean {
        if (!this.lastDragPosition) {
            return true;
        }

        const currentPos = coords;
        const dx = currentPos.longitude - this.lastDragPosition.longitude;
        const dy = currentPos.latitude - this.lastDragPosition.latitude;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const spacing = this.brushManager.getDragSpacing();

        return distance > spacing;
    }

    private getCoordinatesFromMouseEvent(e: MouseEvent): GeoCoordinates | null {
        if (!this.mapView) {
            return null;
        }

        const rect = this.mapView.renderer.domElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        try {
            const result = this.mapView.getGeoCoordinatesAt(x, y);
            return result;
        } catch (error) {
            console.error("Failed to get coordinates:", error);
            return null;
        }
    }

    setBrush(brush: Partial<BrushConfig>): void {
        this.brushManager.setConfig(brush);
    }

    getBrush(): Partial<BrushConfig> {
        return this.brushManager.getConfig();
    }

    addOperation(operation: BrushOperation): string {
        if (!this.demTerrain) {
            throw new Error("DEMTerrainSource not available");
        }

        const id = this.demTerrain.getGroundModificationManager().addOperation(operation);
        this.operationIds.push(id);
        this.operationManager.addOperation(operation);

        if (this.options.onOperationAdded) {
            this.options.onOperationAdded(id, operation);
        }

        if (this.ui) {
            this.ui.updateOperationCount(this.getOperationCount());
        }

        return id;
    }

    removeOperation(id: string): boolean {
        if (!this.demTerrain) {
            return false;
        }

        const success = this.demTerrain.getGroundModificationManager().removeOperation(id);
        if (success) {
            this.operationIds = this.operationIds.filter(opId => opId !== id);
            if (this.options.onOperationRemoved) {
                this.options.onOperationRemoved(id);
            }
            if (this.ui) {
                this.ui.updateOperationCount(this.getOperationCount());
            }
        }

        return success;
    }

    clearOperations(): void {
        if (!this.demTerrain) {
            return;
        }

        this.demTerrain.getGroundModificationManager().clear();
        const removedIds = [...this.operationIds];
        this.operationIds = [];
        this.operationManager.clear();

        if (this.options.onOperationRemoved) {
            removedIds.forEach(id => this.options.onOperationRemoved!(id));
        }

        if (this.ui) {
            this.ui.updateOperationCount(0);
        }
    }

    getOperationCount(): number {
        return this.operationIds.length;
    }

    getAllOperations(): BrushOperation[] {
        if (!this.demTerrain) {
            return [];
        }
        return this.demTerrain.getGroundModificationManager().getAllOperations();
    }

    getOperationIds(): string[] {
        return [...this.operationIds];
    }

    getMapView(): MapView {
        return this.mapView;
    }

    getUI(): TerrainToolsGUI | null {
        return this.ui;
    }

    private handleExport(format: "json" | "clipboard"): void {
        const operations = this.getAllOperations();
        const operationIds = this.getOperationIds();

        if (format === "json") {
            DataExporter.exportAndDownload(operations, operationIds);
        } else if (format === "clipboard") {
            const json = DataExporter.exportToJSON(operations, operationIds);
            DataExporter.copyToClipboard(json);
        }
    }

    getControlPointManager(): TerrainControlPointManager {
        return this.controlPointManager;
    }

    getSelectedControlPoint() {
        return this.controlPointManager.getSelectedPoint();
    }

    removeSelectedControlPoint(): boolean {
        return this.controlPointManager.removeSelectedPoint();
    }

    updateSelectedControlPointConfig(config: any): void {
        const point = this.controlPointManager.getSelectedPoint();
        if (point) {
            point.setConfig(config);
        }
    }

    applyControlPointsToTerrain(): void {
        const points = this.controlPointManager.getAllPoints();

        points.forEach(point => {
            const pointConfig = point.getConfig();
            const brushType = this.getBrushTypeFromString(pointConfig.brushType || "raise");
            const operation: BrushOperation = {
                position: point.geoPosition,
                settings: {
                    type: brushType,
                    radius: pointConfig.radius || 80,
                    hardness: pointConfig.hardness || 0.5,
                    heightDelta: pointConfig.heightDelta || 10,
                    strength: pointConfig.strength || 1,
                    targetAltitude: pointConfig.targetAltitude,
                    scale: pointConfig.scale,
                    persistence: pointConfig.persistence
                }
            };

            const id = this.demTerrain.getGroundModificationManager().addOperation(operation);
            this.operationIds.push(id);
            this.operationManager.addOperation(operation);

            if (this.options.onOperationAdded) {
                this.options.onOperationAdded(id, operation);
            }
        });

        if (this.ui) {
            this.ui.updateOperationCount(this.getOperationCount());
        }
    }

    private getBrushTypeFromString(type: string): BrushType {
        const typeMap: Record<string, BrushType> = {
            raise: BrushType.RAISE,
            lower: BrushType.LOWER,
            smooth: BrushType.SMOOTH,
            flatten: BrushType.FLATTEN,
            noise: BrushType.NOISE,
            erode: BrushType.ERODE
        };
        return typeMap[type] || BrushType.RAISE;
    }
}
