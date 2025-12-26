/* 
 * Copyright (C) 2025 flywave.gl contributors
 * 
 * WindowEventHandler - A class that handles window events uniformly, supporting mouse, keyboard and touch events
 * Provides event dispatch and state management functions, suitable for interactive graphics applications
 */

import { EventDispatcher, Vector2 } from "three";

/**
 * Window event map interface
 * Defines all supported event types and their corresponding event objects
 */
interface WindowEventMap {
    mousemove: MouseEvent;
    mouseup: MouseEvent;
    mouseout: MouseEvent;
    dblclick: MouseEvent;
    premouseclick: MouseEvent;  // Pre-mouse click event
    mouseclick: MouseEvent;     // Mouse click event
    realclick: MouseEvent;      // Real click event
    rightclick: MouseEvent;     // Right click event
    keydown: KeyboardEvent;
    keyup: KeyboardEvent;
    premousedown: MouseEvent;   // Pre-mouse down event
    mousedown: MouseEvent;
    mousewheel: WheelEvent;
    mousedraw: MouseEvent;      // Mouse draw event
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
    public lastMouseZ: number = 0;  // For wheel state

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

    /**
     * Constructor
     * @param el - HTML element to bind events to
     */
    constructor(el: HTMLElement) {
        super();
        this.el = el;
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
                if (prop === 'type') return type;

                // Get from proxy target (Three.js set properties)
                if (prop in target) {
                    return Reflect.get(target, prop, receiver);
                }

                // Get from original event
                if (prop in originalEvent) {
                    const value = (originalEvent as any)[prop];
                    return typeof value === 'function' ? value.bind(originalEvent) : value;
                }

                return undefined;
            },

            set: (target, prop: string | symbol, value: any, receiver) => {
                // Allow setting any property to the proxy target
                return Reflect.set(target, prop, value, receiver);
            },

            has: (target, prop) => {
                return prop === 'type' || prop in target || prop in originalEvent;
            },

            ownKeys: (target) => {
                const targetKeys = Reflect.ownKeys(target);
                const originalKeys = Reflect.ownKeys(originalEvent);
                return Array.from(new Set(['type', ...targetKeys, ...originalKeys]));
            },

            getOwnPropertyDescriptor: (target, prop) => {
                if (prop === 'type') {
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
            this.mouseDown[0] = this._panEnabled;  // Left button controlled by pan function
        } else if (button === 1) {
            this.mouseDown[1] = true;  // Middle button
        } else if (button === 2) {
            this.mouseDown[2] = true;  // Right button
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
        this.onRightClick(event);  // Check right-click
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
        if (this._clickTimeId) {
            clearTimeout(this._clickTimeId);
            this._clickTimeId = null;
        }

        // Double-click zoom functionality
        if (this.doubleZoomEnable) {
            this.lastMouseX = event.offsetX;
            this.lastMouseY = event.offsetY;
            this.lastMouseZ += 10;  // Simulate wheel increment
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

    /**
     * Touch move event handling (converts to mouse event)
     */
    private readonly touchMove = (event: TouchEvent) => {
        if (event.changedTouches.length > 1) {
            return;  // Ignore multi-touch
        }

        const touch = event.changedTouches[0];
        const fakeMouseEvent = new MouseEvent("mousemove", {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0
        });

        event.preventDefault();
        this.onMousemove(fakeMouseEvent);
    };

    /**
     * Touch end event handling (converts to mouse event)
     */
    private readonly touchUp = (event: TouchEvent) => {
        if (event.changedTouches.length > 1) {
            return;
        }

        const touch = event.changedTouches[0];
        const fakeMouseEvent = new MouseEvent("mouseup", {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0
        });

        event.preventDefault();
        this.onMouseUp(fakeMouseEvent);
    };

    /**
     * Touch start event handling (converts to mouse event)
     */
    private readonly touchDown = (event: TouchEvent) => {
        if (event.changedTouches.length > 1) {
            return;
        }

        const touch = event.changedTouches[0];
        const fakeMouseEvent = new MouseEvent("mousedown", {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0
        });

        event.preventDefault();
        this.onMousedown(fakeMouseEvent);
    };

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
        this.el.addEventListener("touchstart", this.touchDown);
        this.el.addEventListener("touchmove", this.touchMove);
        this.el.addEventListener("touchend", this.touchUp);

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
        this.el.removeEventListener("touchstart", this.touchDown);
        this.el.removeEventListener("touchmove", this.touchMove);
        this.el.removeEventListener("touchend", this.touchUp);

        // Window events
        window.removeEventListener("resize", this.onResize);
        window.removeEventListener("load", this.onResize);
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

export { WindowEventHandler, WindowEventMap };