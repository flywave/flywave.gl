/* Copyright (C) 2025 flywave.gl contributors */

import { Vector2 } from "three";

/**
 * Mouse button state array [left, middle, right]
 */
export type MouseState = [boolean, boolean, boolean];

/**
 * Event type definitions
 */
export interface MouseEvent {
    type: string;
    offsetX?: number;
    offsetY?: number;
    clientX?: number;
    clientY?: number;
    button?: number;
}

export interface WheelEvent {
    type: string;
    deltaY?: number;
    deltaX?: number;
}

export type IWindowEventMap = {
    mousemove: MouseEvent;
    mouseup: MouseEvent;
    mouseout: MouseEvent;
    dblclick: MouseEvent;
    premouseclick: MouseEvent;
    mouseclick: MouseEvent;
    realclick: MouseEvent;
    rightclick: MouseEvent;
    keydown: MouseEvent;
    keyup: MouseEvent;
    premousedown: MouseEvent;
    mousedown: MouseEvent;
    mousewheel: WheelEvent;
    mousedraw: MouseEvent;
};

/**
 * Simple event listener type
 */
type EventListener<K extends keyof IWindowEventMap> = (event: IWindowEventMap[K]) => void;

/**
 * Interface for window event handler
 */
export interface IWindowEventHandler {
    mouseDown: MouseState;
    lastMouseX: number;
    lastMouseY: number;
    lastMouseZ: number;
    center_x: number;
    center_y: number;
    width: number;
    height: number;
    panEnabled: boolean;
    zoomEnabled: boolean;
    doubleZoomEnable: boolean;
    addEventListener<K extends keyof IWindowEventMap>(type: K, listener: EventListener<K>): void;
    removeEventListener<K extends keyof IWindowEventMap>(type: K, listener: EventListener<K>): void;
    clearEvent(): void;
    setSize(w: number, h: number): void;
}

// React Native specific types
export interface ReactNativeTouchEvent {
    locationX: number;
    locationY: number;
    pageX: number;
    pageY: number;
    identifier: number;
    timestamp: number;
}

export interface ReactNativeGestureEvent {
    nativeEvent: {
        touches: ReactNativeTouchEvent[];
        changedTouches: ReactNativeTouchEvent[];
    };
}

export interface ReactNativeGLView {
    current: {
        gl: WebGLRenderingContext;
    };
    onStart?: (event: ReactNativeGestureEvent) => void;
    onMove?: (event: ReactNativeGestureEvent) => void;
    onEnd?: (event: ReactNativeGestureEvent) => void;
}

/**
 * React Native Window Event Handler
 * Simple implementation without EventDispatcher complexity
 * Uses ONLY standard IWindowEventHandler properties
 */
export class ReactNativeWindowEventHandler implements IWindowEventHandler {
    // Public properties from IWindowEventHandler interface
    public mouseDown: MouseState = [false, false, false];
    public lastMouseX: number = 0;
    public lastMouseY: number = 0;
    public lastMouseZ: number = 0;
    public center_x: number = 0;
    public center_y: number = 0;
    public width: number = 600;
    public height: number = 300;
    public panEnabled: boolean = true;
    public zoomEnabled: boolean = true;
    public doubleZoomEnable: boolean = true;

    // Event listeners storage - using unknown to avoid any
    private _listeners: Map<keyof IWindowEventMap, Set<EventListener<keyof IWindowEventMap>>> =
        new Map();

    // Minimal temporary variables
    private _clickTimer: ReturnType<typeof setTimeout> | null = null;
    private _lastTapTime: number = 0;
    private readonly DOUBLE_TAP_DELAY: number = 300;

    constructor(private glView: ReactNativeGLView) {
        this.bindEvents();
    }

    /**
     * Bind React Native gesture events
     */
    private bindEvents(): void {
        if (!this.glView) {
            return;
        }

        this.glView.onStart = this.handleTouchStart.bind(this);
        this.glView.onMove = this.handleTouchMove.bind(this);
        this.glView.onEnd = this.handleTouchEnd.bind(this);
    }

    /**
     * Handle touch start
     */
    private handleTouchStart(event: ReactNativeGestureEvent): void {
        const touches = event.nativeEvent.touches;
        if (!touches || touches.length === 0) {
            return;
        }

        const touch = touches[0];
        this.lastMouseX = touch.locationX;
        this.lastMouseY = touch.locationY;

        this.dispatchEvent({ type: "premousedown" });

        if (this.panEnabled) {
            this.mouseDown[0] = true;
        }

        this.dispatchEvent({ type: "mousedown" });
    }

    /**
     * Handle touch move - supports single finger pan and two-finger gestures
     */
    private handleTouchMove(event: ReactNativeGestureEvent): void {
        const touches = event.nativeEvent.touches;
        if (!touches || touches.length === 0) {
            return;
        }

        if (touches.length === 1) {
            // Single finger - pan operation
            const touch = touches[0];
            this.lastMouseX = touch.locationX;
            this.lastMouseY = touch.locationY;
            this.dispatchEvent({ type: "mousemove" });
        } else if (touches.length === 2) {
            // Two fingers - calculate center point and distance
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const centerX = (touches[0].locationX + touches[1].locationX) / 2;
            const centerY = (touches[0].locationY + touches[1].locationY) / 2;

            this.lastMouseX = centerX;
            this.lastMouseY = centerY;

            // Use lastMouseZ to store previous distance for comparison
            const prevDistance = Math.abs(this.lastMouseZ);

            if (Math.abs(distance - prevDistance) > 5) {
                // Pinch zoom detected
                const zoomDelta = (distance - prevDistance) / 100;
                this.lastMouseZ = distance;
                this.dispatchEvent({ type: "mousewheel", deltaY: zoomDelta });
            } else {
                // Rotation detected - activate right mouse button
                this.mouseDown[2] = true;
                this.dispatchEvent({ type: "mousemove" });
            }
        }

        // Trigger draw event if needed
        if (this.mouseDown[0] || this.mouseDown[2] || Math.abs(this.lastMouseZ) > 0) {
            this.dispatchEvent({ type: "mousedraw" });
        }
    }

    /**
     * Handle touch end
     */
    private handleTouchEnd(event: ReactNativeGestureEvent): void {
        const touches = event.nativeEvent.touches;
        const changedTouches = event.nativeEvent.changedTouches;

        if (!changedTouches || changedTouches.length === 0) {
            return;
        }

        const touch = changedTouches[0];
        this.lastMouseX = touch.locationX;
        this.lastMouseY = touch.locationY;

        // Reset all mouse buttons when no touches remain
        if (!touches || touches.length === 0) {
            this.mouseDown[0] = false;
            this.mouseDown[2] = false;
            this.lastMouseZ = 0;

            // Simple tap detection
            this.handleTap(touch);
        }

        this.dispatchEvent({ type: "mouseup" });
    }

    /**
     * Handle tap gesture with double-click detection
     */
    private handleTap(touch: ReactNativeTouchEvent): void {
        const now = Date.now();
        const timeSinceLastTap = now - this._lastTapTime;

        this.dispatchEvent({ type: "realclick" });

        // Check for double tap
        if (timeSinceLastTap < this.DOUBLE_TAP_DELAY && this._clickTimer) {
            // Double tap detected
            if (this._clickTimer) {
                clearTimeout(this._clickTimer);
                this._clickTimer = null;
            }
            this._lastTapTime = 0;

            if (this.doubleZoomEnable) {
                this.lastMouseX = touch.locationX;
                this.lastMouseY = touch.locationY;
                this.lastMouseZ += 10;
            }

            this.dispatchEvent({ type: "dblclick" });
            return;
        }

        // Single tap - wait for potential double tap
        this._lastTapTime = now;
        this._clickTimer = setTimeout(() => {
            if (this._clickTimer) {
                this.dispatchEvent({ type: "premouseclick" });
                this.dispatchEvent({ type: "mouseclick" });
                this._clickTimer = null;
                this._lastTapTime = 0;
            }
        }, this.DOUBLE_TAP_DELAY);
    }

    /**
     * Simple event dispatch
     */
    private dispatchEvent(event: IWindowEventMap[keyof IWindowEventMap]): void {
        const eventType = event.type as keyof IWindowEventMap;
        const listeners = this._listeners.get(eventType);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(event);
                } catch (error) {
                    console.error(`Error in event listener for ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Add event listener
     */
    public addEventListener<K extends keyof IWindowEventMap>(
        type: K,
        listener: EventListener<K>
    ): void {
        if (!this._listeners.has(type)) {
            this._listeners.set(type, new Set());
        }
        this._listeners.get(type)!.add(listener);
    }

    /**
     * Remove event listener
     */
    public removeEventListener<K extends keyof IWindowEventMap>(
        type: K,
        listener: EventListener<K>
    ): void {
        const listeners = this._listeners.get(type);
        if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this._listeners.delete(type);
            }
        }
    }

    /**
     * Set canvas size
     */
    public setSize(w: number, h: number): void {
        this.width = w;
        this.height = h;
        this.center_x = w * 0.5;
        this.center_y = h * 0.5;
    }

    /**
     * Clean up event listeners and resources
     */
    public clearEvent(): void {
        if (this.glView) {
            this.glView.onStart = undefined;
            this.glView.onMove = undefined;
            this.glView.onEnd = undefined;
        }

        if (this._clickTimer) {
            clearTimeout(this._clickTimer);
            this._clickTimer = null;
        }

        this._listeners.clear();
        this._lastTapTime = 0;
        this.mouseDown = [false, false, false];
        this.lastMouseZ = 0;
    }
}
