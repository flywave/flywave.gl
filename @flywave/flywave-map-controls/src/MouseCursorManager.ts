/* Copyright (C) 2025 flywave.gl contributors */

import { type WindowEventHandler } from "@flywave/flywave-utils";

/**
 * Mouse cursor style manager
 * Provides clear, designed visual feedback for different map operations
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

    // Minimalist cursor URLs - black lines, white outline, larger size
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
     * Update the mouse state
     * @param mouseDown Mouse button states
     * @param wheelDelta Wheel delta
     * @param isMoving Whether the mouse is moving
     */
    public update(
        mouseDown: [boolean, boolean, boolean],
        wheelDelta: number,
        isMoving: boolean
    ): void {
        // Check whether a drag is in progress
        const wasDragging = this.isDragging;
        const wasRotating = this.isRotating;

        // Update the drag state
        this.isDragging = mouseDown[0]; // left button
        this.isRotating = mouseDown[2]; // right button

        // Check the wheel state
        if (wheelDelta !== 0) {
            this.isZooming = true;
            this.lastZoomTime = Date.now();
        } else if (Date.now() - this.lastZoomTime > 300) {
            // clear the zooming state after 300ms
            this.isZooming = false;
        }

        // Check the panning state
        if (this.isDragging && isMoving) {
            this.isPanning = true;
        } else if (!this.isDragging) {
            this.isPanning = false;
        }

        // Update the cursor
        this.updateCursor();
    }

    /**
     * Set the double-click zoom state
     */
    public setDoubleClickZooming(): void {
        this.isDoubleClickZooming = true;
        this.updateCursor();

        // clear the double-click zoom state after 500ms
        setTimeout(() => {
            this.isDoubleClickZooming = false;
            this.updateCursor();
        }, 500);
    }

    /**
     * Update the mouse cursor style
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
     * Set the mouse cursor style
     * @param type Cursor type
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
     * Dispose the mouse cursor manager
     */
    public dispose(): void {
        this.canvas.style.cursor = "default";
    }
}
