/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Mouse button state array [left, middle, right]
 */
export type MouseState = [boolean, boolean, boolean];

/**
 * Base event interface
 */
export interface BaseEvent {
    type: string;
}

/**
 * Mouse event interface
 */
export interface MouseEvent extends BaseEvent {
    offsetX?: number;
    offsetY?: number;
    clientX?: number;
    clientY?: number;
    button?: number;
}

/**
 * Wheel event interface
 */
export interface WheelEvent extends BaseEvent {
    deltaX?: number;
    deltaY?: number;
}

/**
 * Key event interface
 */
export interface KeyEvent extends BaseEvent {
    key?: string;
    keyCode?: number;
}

/**
 * Window event map interface with proper types
 */
export interface IWindowEventMap {
    mousemove: MouseEvent;
    mouseup: MouseEvent;
    mouseout: MouseEvent;
    dblclick: MouseEvent;
    premouseclick: MouseEvent;
    mouseclick: MouseEvent;
    realclick: MouseEvent;
    rightclick: MouseEvent;
    keydown: KeyEvent;
    keyup: KeyEvent;
    premousedown: MouseEvent;
    mousedown: MouseEvent;
    mousewheel: WheelEvent;
    mousedraw: MouseEvent;
}

/**
 * Interface for window event handler
 * Abstracts platform-specific event handling (Web DOM vs React Native gestures)
 */
export interface IWindowEventHandler {
    /**
     * Mouse button state [left, middle, right]
     */
    mouseDown: MouseState;

    /**
     * Last mouse X position
     */
    lastMouseX: number;

    /**
     * Last mouse Y position
     */
    lastMouseY: number;

    /**
     * Last mouse wheel/touch Z position
     */
    lastMouseZ: number;

    /**
     * Window/canvas center X position
     */
    center_x: number;

    /**
     * Window/canvas center Y position
     */
    center_y: number;

    /**
     * Window/canvas width
     */
    width: number;

    /**
     * Window/canvas height
     */
    height: number;

    /**
     * Whether pan functionality is enabled
     */
    panEnabled: boolean;

    /**
     * Whether zoom functionality is enabled
     */
    zoomEnabled: boolean;

    /**
     * Whether double-click zoom is enabled
     */
    doubleZoomEnable: boolean;

    /**
     * Add event listener
     */
    addEventListener<K extends keyof IWindowEventMap>(
        type: K,
        listener: (event: IWindowEventMap[K]) => void
    ): void;

    /**
     * Remove event listener
     */
    removeEventListener<K extends keyof IWindowEventMap>(
        type: K,
        listener: (event: IWindowEventMap[K]) => void
    ): void;

    /**
     * Clean up all event listeners
     */
    clearEvent(): void;

    /**
     * Set element size
     */
    setSize(w: number, h: number): void;
}
