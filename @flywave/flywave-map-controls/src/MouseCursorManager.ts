/* Copyright (C) 2025 flywave.gl contributors */

import { WindowEventHandler } from "@flywave/flywave-utils";


/**
 * 鼠标指针样式管理器
 * 为不同的地图操作提供明确且具有设计感的视觉反馈
 */
export class MouseCursorManager {
    private readonly canvas: HTMLElement;
    private readonly eventHandler: WindowEventHandler;
    private currentCursor: string = "default";
    private isDragging: boolean = false;
    private isRotating: boolean = false;
    private isZooming: boolean = false;
    private isDoubleClickZooming: boolean = false;
    private isPanning: boolean = false;
    private lastZoomTime: number = 0;

    // 简约风格的光标URL - 黑色线条，白色描边，更大尺寸
    private readonly customCursors = {
        drag: 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 9 L9 5 L13 9 L17 5 L17 13 L13 17 L17 17" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13 L9 17 L13 13 L9 17 L5 13" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 9 L9 5 L13 9 L17 5 L17 13 L13 17 L17 17" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13 L9 17 L13 13 L9 17 L5 13" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>\') 12 12, grab',
        dragging:
            'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 9 L9 5 L13 9 L17 5 L17 13 L13 17 L17 17" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13 L9 17 L13 13 L9 17 L5 13" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 9 L9 5 L13 9 L17 5 L17 13 L13 17 L17 17" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13 L9 17 L13 13 L9 17 L5 13" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>\') 12 12, grabbing',
        rotate: 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M18 8 A6 6 0 1 1 12 6" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M16 7 L18 8 L17 10" fill="white"/><path d="M6 16 A6 6 0 1 1 12 18" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M8 17 L6 16 L7 14" fill="white"/><path d="M18 8 A6 6 0 1 1 12 6" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/><path d="M16 7 L18 8 L17 10" fill="black"/><path d="M6 16 A6 6 0 1 1 12 18" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/><path d="M8 17 L6 16 L7 14" fill="black"/></svg>\') 12 12, move',
        zoomIn: 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4 L8 8 M20 20 L16 16 M20 4 L16 8 M4 20 L8 16" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M12 8 L12 16 M8 12 L16 12" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M4 4 L8 8 M20 20 L16 16 M20 4 L16 8 M4 20 L8 16" stroke="black" stroke-width="2" stroke-linecap="round"/><path d="M12 8 L12 16 M8 12 L16 12" stroke="black" stroke-width="2" stroke-linecap="round"/></svg>\') 12 12, zoom-in',
        zoomOut:
            'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4 L8 8 M20 20 L16 16 M20 4 L16 8 M4 20 L8 16" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M8 12 L16 12" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M4 4 L8 8 M20 20 L16 16 M20 4 L16 8 M4 20 L8 16" stroke="black" stroke-width="2" stroke-linecap="round"/><path d="M8 12 L16 12" stroke="black" stroke-width="2" stroke-linecap="round"/></svg>\') 12 12, zoom-out',
        default: "default"
    };

    constructor(canvas: HTMLElement, eventHandler: WindowEventHandler) {
        this.canvas = canvas;
        this.eventHandler = eventHandler;
        this.setCursor("default");
    }

    /**
     * 更新鼠标状态
     * @param mouseDown 鼠标按键状态
     * @param wheelDelta 滚轮变化量
     * @param isMoving 是否在移动
     */
    public update(
        mouseDown: [boolean, boolean, boolean],
        wheelDelta: number,
        isMoving: boolean
    ): void {
        // 检查是否正在拖拽
        const wasDragging = this.isDragging;
        const wasRotating = this.isRotating;

        // 更新拖拽状态
        this.isDragging = mouseDown[0]; // 左键
        this.isRotating = mouseDown[2]; // 右键

        // 检查滚轮状态
        if (wheelDelta !== 0) {
            this.isZooming = true;
            this.lastZoomTime = Date.now();
        } else if (Date.now() - this.lastZoomTime > 300) {
            // 300ms后取消缩放状态
            this.isZooming = false;
        }

        // 检查平移状态
        if (this.isDragging && isMoving) {
            this.isPanning = true;
        } else if (!this.isDragging) {
            this.isPanning = false;
        }

        // 更新光标
        this.updateCursor();
    }

    /**
     * 设置双击缩放状态
     */
    public setDoubleClickZooming(): void {
        this.isDoubleClickZooming = true;
        this.updateCursor();

        // 500ms后取消双击缩放状态
        setTimeout(() => {
            this.isDoubleClickZooming = false;
            this.updateCursor();
        }, 500);
    }

    /**
     * 更新鼠标指针样式
     */
    private updateCursor(): void {
        if (this.isDoubleClickZooming) {
            this.setCursor("zoomIn");
        } else if (this.isZooming && this.isDragging) {
            this.setCursor("dragging");
        } else if (this.isZooming) {
            this.setCursor("zoomIn");
        } else if (this.isRotating) {
            this.setCursor("rotate");
        } else if (this.isPanning) {
            this.setCursor("dragging");
        } else if (this.isDragging) {
            this.setCursor("drag");
        } else {
            this.setCursor("default");
        }
    }

    /**
     * 设置鼠标指针样式
     * @param type 指针类型
     */
    private setCursor(type: string): void {
        if (this.currentCursor === type) {
            return;
        }

        this.currentCursor = type;

        switch (type) {
            case "default":
                this.canvas.style.cursor = this.customCursors.default;
                break;
            case "drag":
                this.canvas.style.cursor = this.customCursors.drag;
                break;
            case "dragging":
                this.canvas.style.cursor = this.customCursors.dragging;
                break;
            case "rotate":
                this.canvas.style.cursor = this.customCursors.rotate;
                break;
            case "zoomIn":
                this.canvas.style.cursor = this.customCursors.zoomIn;
                break;
            case "zoomOut":
                this.canvas.style.cursor = this.customCursors.zoomOut;
                break;
            default:
                this.canvas.style.cursor = this.customCursors.default;
        }
    }

    /**
     * 销毁鼠标指针管理器
     */
    public dispose(): void {
        this.canvas.style.cursor = "default";
    }
}
