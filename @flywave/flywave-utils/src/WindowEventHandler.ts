/*
 * Copyright (C) 2025 flywave.gl contributors
 *
 * WindowEventHandler - A class that handles window events uniformly, supporting mouse, keyboard and touch events
 * Provides event dispatch and state management functions, suitable for interactive graphics applications
 */

import { EventDispatcher, Vector2 } from "three/webgpu";

/** Max finger travel (canvas-local px) for a touch to count as a tap. */
const TAP_SLOP_PX = 5;
/** Max interval between the two taps of a double tap. */
const DOUBLE_TAP_INTERVAL_MS = 300;
/** Max distance between the two tap points of a double tap. */
const DOUBLE_TAP_SLOP_PX = 30;
/** Max duration of a single tap gesture. */
const TAP_MAX_DURATION_MS = 350;
/**
 * Pinch sensitivity: wheel-delta added per log2 of the finger distance ratio.
 * A distance doubling (+1) equals 2.5 wheel notches (a notch is 2), landing
 * between a wheel notch and the double-click zoom (+10).
 */
const PINCH_WHEEL_SCALE = 5;

/**
 * Window event map interface
 * Defines all supported event types and their corresponding event objects
 */
interface WindowEventMap {
    mousemove: MouseEvent;
    mouseup: MouseEvent;
    mouseout: MouseEvent;
    dblclick: MouseEvent;
    premouseclick: MouseEvent; // Pre-mouse click event
    mouseclick: MouseEvent; // Mouse click event
    realclick: MouseEvent; // Real click event
    rightclick: MouseEvent; // Right click event
    keydown: KeyboardEvent;
    keyup: KeyboardEvent;
    premousedown: MouseEvent; // Pre-mouse down event
    mousedown: MouseEvent;
    mousewheel: WheelEvent;
    mousedraw: MouseEvent; // Mouse draw event
}

/**
 * Window event handler class
 * Manages mouse, keyboard and touch events, and provides event dispatch functionality
 */
class WindowEventHandler extends EventDispatcher<WindowEventMap> {
    // Mouse button state array [left, middle, right]
    public mouseDown: [boolean, boolean, boolean] = [false, false, false];

    // Feature switches
    private _panEnabled: boolean = true;
    public zoomEnabled: boolean = true;
    public doubleZoomEnable: boolean = true;

    // Mouse position state
    public lastMouseX: number = 0;
    public lastMouseY: number = 0;
    public lastMouseZ: number = 0; // For wheel state

    // Window size information
    public center_x: number = 0;
    public center_y: number = 0;
    public width: number = 600;
    public height: number = 300;

    private readonly el: HTMLElement;
    private _lastMouseDownPoint: Vector2 | null = null;
    private _clickTimeId: number | null = null;

    // State cache for detecting changes
    private __preMouseDown?: [boolean, boolean, boolean];
    private __panEnabled?: boolean;
    private __zoomEnabled?: boolean;
    private __lastMouseX?: number;
    private __lastMouseY?: number;
    private __lastMouseZ?: number;

    // ==================== Touch gesture state ====================
    // Active touches by identifier, positions in canvas-local CSS pixels.
    private readonly m_touchPositions = new Map<number, { x: number; y: number }>();
    /** Where the current touch gesture started (canvas-local), for tap detection. */
    private m_gestureStart: { x: number; y: number; time: number } | null = null;
    /** The gesture saw two or more simultaneous fingers (blocks tap synthesis). */
    private m_isMultiTouch: boolean = false;
    /** Pinch baseline: distance and angle between the first two fingers. */
    private m_pinchDistance: number = 0;
    private m_pinchAngle: number = 0;
    /** Offset keeping the virtual pointer continuous across finger count changes. */
    private m_pointerOffsetX: number = 0;
    private m_pointerOffsetY: number = 0;
    /** Previous completed tap, for double-tap detection. */
    private m_lastTap: { x: number; y: number; time: number } | null = null;
    /** The current gesture's first tap qualified as the first tap of a double tap. */
    private m_doubleTapArmed: boolean = false;
    /** Accumulated two-finger twist in radians, consumed via takeTwistDelta. */
    private m_twistDelta: number = 0;

    /**
     * Constructor
     * @param el - HTML element to bind events to
     */
    constructor(el: HTMLElement) {
        super();
        this.el = el;
        this.applyTouchAction();
        this.bindEvent();
    }

    /**
     * Sets whether pan functionality is enabled
     */
    set panEnabled(v: boolean) {
        this._panEnabled = v;
        // Reset all mouse button states when disabled
        this.mouseDown[0] = false;
        this.mouseDown[1] = false;
        this.mouseDown[2] = false;
    }

    /**
     * Gets the pan functionality enabled status
     */
    get panEnabled(): boolean {
        return this._panEnabled;
    }

    private createEventProxy<T extends keyof WindowEventMap>(
        type: T,
        originalEvent: WindowEventMap[T]
    ): any {
        // Create an empty object as the proxy target
        const proxyTarget = {};

        return new Proxy(proxyTarget, {
            get: (target, prop: string | symbol, receiver) => {
                // Fixed properties
                if (prop === "type") return type;

                // Get from proxy target (Three.js set properties)
                if (prop in target) {
                    return Reflect.get(target, prop, receiver);
                }

                // Get from original event
                if (prop in originalEvent) {
                    const value = (originalEvent as any)[prop];
                    return typeof value === "function" ? value.bind(originalEvent) : value;
                }

                return undefined;
            },

            set: (target, prop: string | symbol, value: any, receiver) => {
                // Allow setting any property to the proxy target
                return Reflect.set(target, prop, value, receiver);
            },

            has: (target, prop) => {
                return prop === "type" || prop in target || prop in originalEvent;
            },

            ownKeys: target => {
                const targetKeys = Reflect.ownKeys(target);
                const originalKeys = Reflect.ownKeys(originalEvent);
                return Array.from(new Set(["type", ...targetKeys, ...originalKeys]));
            },

            getOwnPropertyDescriptor: (target, prop) => {
                if (prop === "type") {
                    return {
                        value: type,
                        writable: false,
                        enumerable: true,
                        configurable: true
                    };
                }

                // First get descriptor from proxy target
                const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
                if (targetDescriptor) return targetDescriptor;

                // Then get from original event
                const originalDescriptor = Reflect.getOwnPropertyDescriptor(originalEvent, prop);
                if (originalDescriptor) {
                    return {
                        ...originalDescriptor,
                        configurable: true
                    };
                }

                return undefined;
            }
        });
    }

    /**
     * Conditionally dispatches events
     */
    private dispatchConditionalEvent<T extends keyof WindowEventMap>(
        type: T,
        event: WindowEventMap[T]
    ): void {
        const threeEvent = this.createEventProxy(type, event);
        this.dispatchEvent(threeEvent as any);

        if (this.checkNeedDraw() && type !== "mousedraw") {
            const drawEvent = this.createEventProxy("mousedraw", event as MouseEvent);
            this.dispatchEvent(drawEvent as any);
        }
    }

    // ==================== Event Handler Functions ====================

    /**
     * Mouse wheel event handling
     */
    private readonly onMouseWheel = (event: WheelEvent) => {
        if (!this.zoomEnabled) {
            return;
        }

        let wheelDelta = 0;

        // Calculate wheel increment
        if (event.deltaY) {
            wheelDelta = (-event.deltaY / 120) * 2;
        }

        if (wheelDelta) {
            this.lastMouseZ += wheelDelta;
        }

        // A wheel event carries the pointer position — keep lastMouseX/Y in
        // sync. Touchpad scrolling never fires mousemove, so without this the
        // pick/zoom target falls back to a stale (0,0) position (i.e. the
        // screen corner after load) instead of the actual cursor.
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        event.preventDefault();
        this.dispatchConditionalEvent("mousewheel", event);
    };

    /**
     * Window resize event handling
     */
    private readonly onResize = () => {
        let offsetWidth: number, offsetHeight: number;

        // Get parent element or window dimensions
        if (this.el.parentNode && (this.el.parentNode as HTMLElement).offsetWidth) {
            offsetWidth = (this.el.parentNode as HTMLElement).offsetWidth;
        } else {
            offsetWidth = window.innerWidth || 320;
        }

        if (this.el.parentNode && (this.el.parentNode as HTMLElement).offsetHeight) {
            offsetHeight = (this.el.parentNode as HTMLElement).offsetHeight;
        } else {
            offsetHeight = window.innerHeight || 320;
        }

        this.setSize(offsetWidth, offsetHeight);
    };

    /**
     * Right-click context menu event handling (prevents default behavior)
     */
    private readonly onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
    };

    /**
     * Mouse down event handling
     */
    private readonly onMousedown = (event: MouseEvent) => {
        const button = event.button;
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        // Dispatch pre-mousedown event
        this.dispatchConditionalEvent("premousedown", event);

        // Set state based on button
        if (button === 0) {
            this.mouseDown[0] = this._panEnabled; // Left button controlled by pan function
        } else if (button === 1) {
            this.mouseDown[1] = true; // Middle button
        } else if (button === 2) {
            this.mouseDown[2] = true; // Right button
        }

        // Record press position for click detection
        this._lastMouseDownPoint = new Vector2(event.offsetX, event.offsetY);
        this.dispatchConditionalEvent("mousedown", event);
    };

    /**
     * Mouse move event handling
     */
    private readonly onMousemove = (event: MouseEvent) => {
        event.preventDefault();
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        this.dispatchConditionalEvent("mousemove", event);
    };

    /**
     * Mouse out event handling
     */
    private readonly onMouseOut = (event: MouseEvent) => {
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;
        // Reset all mouse button states when moving out
        this.mouseDown[0] = false;
        this.mouseDown[1] = false;
        this.mouseDown[2] = false;

        event.stopPropagation();
        this.dispatchConditionalEvent("mouseout", event);
    };

    /**
     * Mouse up event handling
     */
    private readonly onMouseUp = (event: MouseEvent) => {
        const button = event.button;
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        // Reset state based on button
        if (button === 0) {
            this.mouseDown[0] = false;
        } else if (button === 1) {
            this.mouseDown[1] = false;
        } else if (button === 2) {
            this.mouseDown[2] = false;
        }

        this.dispatchConditionalEvent("mouseup", event);
        this.onRightClick(event); // Check right-click
    };

    /**
     * Mouse click event handling
     */
    private readonly onClick = (event: MouseEvent) => {
        const point = new Vector2(event.offsetX, event.offsetY);

        // Check if it's a valid click (movement less than 3 pixels)
        if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
            // Delay dispatching click event to avoid conflict with double-click
            this._clickTimeId = window.setTimeout(() => {
                if (this._clickTimeId) {
                    this.dispatchConditionalEvent("premouseclick", event);
                    this.dispatchConditionalEvent("mouseclick", event);
                }
            }, 200);

            this.dispatchConditionalEvent("realclick", event);
        }
    };

    /**
     * Right-click detection
     */
    private readonly onRightClick = (event: MouseEvent) => {
        if (event.button === 2) {
            const point = new Vector2(event.offsetX, event.offsetY);
            // Check if it's a valid right-click
            if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
                this.dispatchConditionalEvent("rightclick", event);
            }
        }
    };

    /**
     * Double-click event handling
     */
    private readonly onDoubleClick = (event: MouseEvent) => {
        if (!this.zoomEnabled) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();

        // Clear possible single-click timer
        this.cancelClickTimer();

        // Double-click zoom functionality
        if (this.doubleZoomEnable) {
            this.lastMouseX = event.offsetX;
            this.lastMouseY = event.offsetY;
            this.lastMouseZ += 10; // Simulate wheel increment
        }

        this.dispatchConditionalEvent("dblclick", event);
    };

    /**
     * Keyboard key down event handling
     */
    private readonly onKeydown = (event: KeyboardEvent) => {
        this.dispatchConditionalEvent("keydown", event);
    };

    /**
     * Keyboard key up event handling
     */
    private readonly onKeyup = (event: KeyboardEvent) => {
        this.dispatchConditionalEvent("keyup", event);
    };

    // ==================== Touch Event Handling ====================
    // Touch gestures are translated into the mouse state consumed by the
    // camera controls: one finger maps to mouse drag (pan), two fingers map to
    // pinch zoom (wheel delta) + twist (takeTwistDelta) + midpoint pan. Taps
    // synthesize the click events that touchstart preventDefault suppresses.

    /**
     * Touch start: first finger begins a drag, further fingers enter the
     * pinch/twist gesture without re-triggering a press.
     */
    private readonly onTouchStart = (event: TouchEvent) => {
        event.preventDefault();

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            this.m_touchPositions.set(
                touch.identifier,
                this.toCanvasLocal(touch.clientX, touch.clientY)
            );
        }

        // A new gesture (or the second tap of a double tap) cancels a pending
        // single click, mirroring how a real dblclick cancels the delayed click.
        this.cancelClickTimer();

        if (this.m_touchPositions.size === 1) {
            const position = this.firstTouchPosition();
            const now = performance.now();
            this.m_gestureStart = { x: position.x, y: position.y, time: now };
            this.m_isMultiTouch = false;
            this.m_pointerOffsetX = 0;
            this.m_pointerOffsetY = 0;
            this.m_doubleTapArmed =
                this.m_lastTap !== null &&
                now - this.m_lastTap.time <= DOUBLE_TAP_INTERVAL_MS &&
                Math.hypot(position.x - this.m_lastTap.x, position.y - this.m_lastTap.y) <=
                    DOUBLE_TAP_SLOP_PX;
            this.onMousedown(this.createTouchMouseEvent("mousedown", position));
            return;
        }

        this.m_isMultiTouch = true;
        if (this.m_touchPositions.size === 2) {
            this.reanchorPinch();
            this.reanchorPointerOffset();
        }
    };

    /**
     * Touch move: single finger maps to mousemove; two fingers feed pinch
     * zoom, twist and midpoint pan.
     */
    private readonly onTouchMove = (event: TouchEvent) => {
        event.preventDefault();

        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (this.m_touchPositions.has(touch.identifier)) {
                this.m_touchPositions.set(
                    touch.identifier,
                    this.toCanvasLocal(touch.clientX, touch.clientY)
                );
            }
        }

        if (this.m_touchPositions.size === 0) {
            return;
        }

        if (this.m_touchPositions.size === 1 && !this.m_isMultiTouch) {
            this.onMousemove(this.createTouchMouseEvent("mousemove", this.firstTouchPosition()));
            return;
        }

        this.updatePinchAndPointer();
    };

    /**
     * Touch end: the last lifted finger ends the gesture (mouseup + tap
     * synthesis); lifting one of two fingers re-anchors pinch and pointer.
     */
    private readonly onTouchEnd = (event: TouchEvent) => {
        event.preventDefault();

        for (let i = 0; i < event.changedTouches.length; i++) {
            this.m_touchPositions.delete(event.changedTouches[i].identifier);
        }

        if (this.m_touchPositions.size >= 2) {
            this.reanchorPinch();
            this.reanchorPointerOffset();
            return;
        }

        if (this.m_touchPositions.size === 1) {
            // Keep the virtual pointer continuous so the drag does not jump
            // from the pinch midpoint to the remaining finger.
            this.reanchorPointerOffset();
            return;
        }

        this.finishGesture();
    };

    /**
     * Touch cancel: immediately end the gesture without tap/click synthesis,
     * otherwise the pressed state leaks into later mouse input.
     */
    private readonly onTouchCancel = (event: TouchEvent) => {
        event.preventDefault();

        // Only release our own touch gesture; a cancel arriving during a real
        // mouse drag (mixed touch/trackpad devices) must not inject a mouseup.
        const hadGesture =
            this.m_gestureStart !== null || this.m_isMultiTouch || this.m_touchPositions.size > 0;

        for (let i = 0; i < event.changedTouches.length; i++) {
            this.m_touchPositions.delete(event.changedTouches[i].identifier);
        }
        this.resetTouchGestureState();

        if (hadGesture) {
            this.onMouseUp(this.createTouchMouseEvent("mouseup", this.currentPointerPosition()));
        }
    };

    /**
     * Ends a fully lifted gesture: mouseup plus tap/click/double-tap synthesis.
     */
    private finishGesture(): void {
        const start = this.m_gestureStart;
        const position = this.currentPointerPosition();
        const wasMultiTouch = this.m_isMultiTouch;
        const now = performance.now();

        this.onMouseUp(this.createTouchMouseEvent("mouseup", position));

        const isTap =
            !wasMultiTouch &&
            start !== null &&
            now - start.time <= TAP_MAX_DURATION_MS &&
            Math.hypot(position.x - start.x, position.y - start.y) <= TAP_SLOP_PX;

        if (isTap) {
            if (this.m_doubleTapArmed) {
                this.m_doubleTapArmed = false;
                this.m_lastTap = null;
                this.onDoubleClick(this.createTouchMouseEvent("dblclick", position));
            } else {
                this.m_lastTap = { x: position.x, y: position.y, time: now };
                // Reuse the desktop click path (3px re-check + delayed
                // dispatch) so touch and mouse produce identical semantics.
                this.onClick(this.createTouchMouseEvent("click", position));
            }
        } else {
            this.m_lastTap = null;
            this.m_doubleTapArmed = false;
        }

        this.resetTouchGestureState();
    }

    /**
     * Pinch zoom + twist from the first two fingers; the touch midpoint drives
     * the virtual pointer (keeps pan following the fingers and gives the wheel
     * zoom its target pixel).
     */
    private updatePinchAndPointer(): void {
        if (this.m_touchPositions.size >= 2) {
            const pair = this.firstTwoTouchPositions();
            if (pair !== null) {
                const [a, b] = pair;
                const distance = Math.hypot(b.x - a.x, b.y - a.y);
                const angle = Math.atan2(b.y - a.y, b.x - a.x);
                if (this.m_pinchDistance > 0) {
                    const ratio = distance / this.m_pinchDistance;
                    if (ratio > 0 && this.zoomEnabled) {
                        this.lastMouseZ += Math.log2(ratio) * PINCH_WHEEL_SCALE;
                    }
                    let twist = angle - this.m_pinchAngle;
                    // Wrap to [-PI, PI] so crossing the +/-PI seam stays short.
                    twist = Math.atan2(Math.sin(twist), Math.cos(twist));
                    this.m_twistDelta += twist;
                }
                this.m_pinchDistance = distance;
                this.m_pinchAngle = angle;
            }
        }

        const midpoint = this.touchesMidpoint();
        if (midpoint !== null) {
            this.onMousemove(
                this.createTouchMouseEvent("mousemove", {
                    x: midpoint.x + this.m_pointerOffsetX,
                    y: midpoint.y + this.m_pointerOffsetY
                })
            );
        }
    }

    private reanchorPinch(): void {
        const pair = this.firstTwoTouchPositions();
        if (pair === null) {
            this.m_pinchDistance = 0;
            return;
        }
        const [a, b] = pair;
        this.m_pinchDistance = Math.hypot(b.x - a.x, b.y - a.y);
        this.m_pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
    }

    /**
     * Keeps the virtual pointer continuous: offset = current pointer - new
     * touch centroid, so switching finger count never jumps the pointer.
     */
    private reanchorPointerOffset(): void {
        const midpoint = this.touchesMidpoint();
        if (midpoint === null) {
            return;
        }
        this.m_pointerOffsetX = this.lastMouseX - midpoint.x;
        this.m_pointerOffsetY = this.lastMouseY - midpoint.y;
    }

    private resetTouchGestureState(): void {
        this.m_touchPositions.clear();
        this.m_gestureStart = null;
        this.m_isMultiTouch = false;
        this.m_pinchDistance = 0;
        this.m_pointerOffsetX = 0;
        this.m_pointerOffsetY = 0;
        this.m_doubleTapArmed = false;
        this.m_twistDelta = 0;
    }

    private firstTouchPosition(): { x: number; y: number } {
        const values = Array.from(this.m_touchPositions.values());
        return values.length > 0 ? values[0] : { x: 0, y: 0 };
    }

    private firstTwoTouchPositions(): Array<{ x: number; y: number }> | null {
        const values = Array.from(this.m_touchPositions.values());
        return values.length >= 2 ? [values[0], values[1]] : null;
    }

    private touchesMidpoint(): { x: number; y: number } | null {
        const values = Array.from(this.m_touchPositions.values());
        if (values.length === 0) {
            return null;
        }
        let x = 0;
        let y = 0;
        for (const position of values) {
            x += position.x;
            y += position.y;
        }
        return { x: x / values.length, y: y / values.length };
    }

    /** The virtual pointer position last fed into the mouse pipeline. */
    private currentPointerPosition(): { x: number; y: number } {
        return { x: this.lastMouseX, y: this.lastMouseY };
    }

    /**
     * Converts client coordinates to canvas-local CSS pixels. The mouse
     * pipeline stores offsetX/offsetY (canvas padding edge), which real mouse
     * events provide but touch events must compute here.
     */
    private toCanvasLocal(clientX: number, clientY: number): { x: number; y: number } {
        const rect = this.el.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    /**
     * Synthetic mouse event carrying canvas-local coordinates in clientX/Y:
     * handlers read offsetX, which for undispatched synthetic events falls
     * back to clientX, so downstream offsetX consumers get canvas-local values.
     */
    private createTouchMouseEvent(type: string, position: { x: number; y: number }): MouseEvent {
        return new MouseEvent(type, {
            clientX: position.x,
            clientY: position.y,
            button: 0
        });
    }

    private cancelClickTimer(): void {
        if (this._clickTimeId) {
            clearTimeout(this._clickTimeId);
            this._clickTimeId = null;
        }
    }

    /**
     * Two-finger twist accumulated since the previous call, in radians.
     * Positive values are clockwise rotations on screen (screen Y points down,
     * matching the atan2 convention of the pinch baseline).
     */
    public takeTwistDelta(): number {
        const delta = this.m_twistDelta;
        this.m_twistDelta = 0;
        return delta;
    }

    /**
     * Two-finger gestures (pinch/twist) must not fall through to browser page
     * zoom or scroll; iOS Safari ignores user-scalable=no, so CSS is the only
     * reliable switch. Only overrides the default, never an explicit choice.
     */
    private applyTouchAction(): void {
        if (getComputedStyle(this.el).touchAction === "auto") {
            this.el.style.touchAction = "none";
        }
    }

    // ==================== Public Methods ====================

    /**
     * Bind all event listeners
     */
    private bindEvent() {
        // Mouse events
        this.el.addEventListener("contextmenu", this.onContextMenu);
        this.el.addEventListener("wheel", this.onMouseWheel);
        this.el.addEventListener("mousedown", this.onMousedown);
        this.el.addEventListener("mousemove", this.onMousemove);
        this.el.addEventListener("mouseout", this.onMouseOut);
        this.el.addEventListener("mouseup", this.onMouseUp);
        this.el.addEventListener("click", this.onClick);
        this.el.addEventListener("dblclick", this.onDoubleClick);

        // Keyboard events
        this.el.addEventListener("keydown", this.onKeydown);
        this.el.addEventListener("keyup", this.onKeyup);

        // Touch events
        this.el.addEventListener("touchstart", this.onTouchStart);
        this.el.addEventListener("touchmove", this.onTouchMove);
        this.el.addEventListener("touchend", this.onTouchEnd);
        this.el.addEventListener("touchcancel", this.onTouchCancel);

        // Window events
        window.addEventListener("resize", this.onResize);
        window.addEventListener("load", this.onResize);
    }

    /**
     * Clean up all event listeners
     */
    public clearEvent = () => {
        // Mouse events
        this.el.removeEventListener("contextmenu", this.onContextMenu);
        this.el.removeEventListener("wheel", this.onMouseWheel);
        this.el.removeEventListener("mousedown", this.onMousedown);
        this.el.removeEventListener("mousemove", this.onMousemove);
        this.el.removeEventListener("mouseout", this.onMouseOut);
        this.el.removeEventListener("mouseup", this.onMouseUp);
        this.el.removeEventListener("click", this.onClick);
        this.el.removeEventListener("dblclick", this.onDoubleClick);

        // Keyboard events
        this.el.removeEventListener("keydown", this.onKeydown);
        this.el.removeEventListener("keyup", this.onKeyup);

        // Touch events
        this.el.removeEventListener("touchstart", this.onTouchStart);
        this.el.removeEventListener("touchmove", this.onTouchMove);
        this.el.removeEventListener("touchend", this.onTouchEnd);
        this.el.removeEventListener("touchcancel", this.onTouchCancel);

        // Window events
        window.removeEventListener("resize", this.onResize);
        window.removeEventListener("load", this.onResize);

        this.cancelClickTimer();
    };

    /**
     * Set element size
     * @param w - width
     * @param h - height
     */
    public setSize(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.center_x = w * 0.5;
        this.center_y = h * 0.5;
        this.el.style.width = w + "px";
        this.el.style.height = h + "px";
    }

    // ==================== Private Methods ====================

    /**
     * Check if drawing event needs to be triggered
     * Based on mouse state, feature switches and position changes
     * @returns Whether drawing is needed
     */
    private checkNeedDraw(): boolean {
        // Initialize state cache
        if (!this.__preMouseDown) {
            this.__preMouseDown = [...this.mouseDown];
            return true; // Initial state always needs drawing
        }

        const [a, b, c] = this.__preMouseDown;
        const [a1, b1, c1] = this.mouseDown;

        // Check mouse button state changes
        if (a !== a1 || b !== b1 || c !== c1) {
            this.__preMouseDown = [...this.mouseDown];
            return true;
        }

        // Check pan function status changes
        if (this.__panEnabled !== this.panEnabled) {
            this.__panEnabled = this.panEnabled;
            return true;
        }

        // Check zoom function status changes
        if (this.__zoomEnabled !== this.zoomEnabled) {
            this.__zoomEnabled = this.zoomEnabled;
            return true;
        }

        // Check position changes when mouse is pressed
        if (a1 || b1 || c1) {
            if (this.__lastMouseX !== this.lastMouseX) {
                this.__lastMouseX = this.lastMouseX;
                return true;
            }

            if (this.__lastMouseY !== this.lastMouseY) {
                this.__lastMouseY = this.lastMouseY;
                return true;
            }
        }

        // Check wheel state changes
        if (this.__lastMouseZ !== this.lastMouseZ) {
            this.__lastMouseZ = this.lastMouseZ;
            return true;
        }

        return false;
    }
}

export { WindowEventHandler, type WindowEventMap };
