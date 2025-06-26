import { Vector2, EventDispatcher } from "three";

type WindowEventMap = {
    mousemove: { event: MouseEvent };
    mouseup: { event: MouseEvent };
    mouseout: { event: MouseEvent };
    dblclick: { event: MouseEvent };
    premouseclick: { event: MouseEvent };
    mouseclick: { event: MouseEvent };
    realclick: { event: MouseEvent };
    rightclick: { event: MouseEvent };
    keydown: { event: KeyboardEvent };
    keyup: { event: KeyboardEvent };
    premousedown: { event: MouseEvent };
    mousedown: { event: MouseEvent };
    mousewheel: { event: WheelEvent };
    mousedraw: { event: MouseEvent };
};

class WindowEventHandler extends EventDispatcher<WindowEventMap> {
    private mouseDown: [boolean, boolean, boolean] = [false, false, false];
    private _panEnabled: boolean = true;
    public zoomEnabled: boolean = true;
    public doubleZoomEnable: boolean = true;
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;
    private lastMouseZ: number = 0;
    public center_x: number = 0;
    public center_y: number = 0;
    public width: number = 600;
    public height: number = 300;
    private el: HTMLElement;
    private _lastMouseDownPoint: Vector2 | null = null;
    private _clickTimeId: number | null = null;
    private __preMouseDown?: [boolean, boolean, boolean];
    private __panEnabled?: boolean;
    private __zoomEnabled?: boolean;
    private __lastMouseX?: number;
    private __lastMouseY?: number;
    private __lastMouseZ?: number;

    constructor(el: HTMLElement) {
        super();
        this.el = el;
        this.bindEvent();
    }

    set panEnabled(v: boolean) {
        this._panEnabled = v;
        this.mouseDown[0] = false;
        this.mouseDown[1] = false;
        this.mouseDown[2] = false;
    }

    get panEnabled(): boolean {
        return this._panEnabled;
    }

    private dispatchConditionalEvent<T extends keyof WindowEventMap>(
        type: T,
        event: WindowEventMap[T]["event"]
    ): void {
        //@ts-ignore
        this.dispatchEvent({ type, event });
        if (this.checkNeedDraw() && type !== "mousedraw") {
            //@ts-ignore
            this.dispatchEvent({ type: "mousedraw", event });
        }
    }

    private onMouseWheel = (event: WheelEvent) => {
        if (!this.zoomEnabled) {
            return;
        }

        let wheelDelta = 0;
        if (event.deltaY) {
            wheelDelta = (-event.deltaY / 3) * 2;
        }

        if (wheelDelta) {
            this.lastMouseZ += wheelDelta;
        }

        event.preventDefault();
        this.dispatchConditionalEvent("mousewheel", event);
    };

    private onResize = () => {
        let offsetWidth: number, offsetHeight: number;

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

    private onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
    };

    private onMousedown = (event: MouseEvent) => {
        const button = event.button;
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        this.dispatchConditionalEvent("premousedown", event);

        if (button === 0) {
            this.mouseDown[0] = this._panEnabled;
        } else if (button === 1) {
            this.mouseDown[1] = true;
        } else if (button === 2) {
            this.mouseDown[2] = true;
        }

        this._lastMouseDownPoint = new Vector2(event.offsetX, event.offsetY);
        this.dispatchConditionalEvent("mousedown", event);
    };

    private onMousemove = (event: MouseEvent) => {
        event.preventDefault();
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        this.dispatchConditionalEvent("mousemove", event);
    };

    private onMouseOut = (event: MouseEvent) => {
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;
        this.mouseDown[0] = false;
        this.mouseDown[1] = false;
        this.mouseDown[2] = false;
        event.stopPropagation();
        this.dispatchConditionalEvent("mouseout", event);
    };

    private onMouseUp = (event: MouseEvent) => {
        const button = event.button;
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        if (button === 0) {
            this.mouseDown[0] = false;
        } else if (button === 1) {
            this.mouseDown[1] = false;
        } else if (button === 2) {
            this.mouseDown[2] = false;
        }

        this.dispatchConditionalEvent("mouseup", event);
        this.onRightClick(event);
    };

    private onClick = (event: MouseEvent) => {
        const point = new Vector2(event.offsetX, event.offsetY);
        if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
            this._clickTimeId = window.setTimeout(() => {
                if (this._clickTimeId) {
                    this.dispatchConditionalEvent("premouseclick", event);
                    this.dispatchConditionalEvent("mouseclick", event);
                }
            }, 200);

            this.dispatchConditionalEvent("realclick", event);
        }
    };

    private onRightClick = (event: MouseEvent) => {
        if (event.button === 2) {
            const point = new Vector2(event.offsetX, event.offsetY);
            if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
                this.dispatchConditionalEvent("rightclick", event);
            }
        }
    };

    private onDoubleClick = (event: MouseEvent) => {
        if (!this.zoomEnabled) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();

        if (this._clickTimeId) {
            clearTimeout(this._clickTimeId);
            this._clickTimeId = null;
        }

        if (this.doubleZoomEnable) {
            this.lastMouseX = event.offsetX;
            this.lastMouseY = event.offsetY;
            this.lastMouseZ += 10;
        }

        this.dispatchConditionalEvent("dblclick", event);
    };

    private onKeydown = (event: KeyboardEvent) => {
        this.dispatchConditionalEvent("keydown", event);
    };

    private onKeyup = (event: KeyboardEvent) => {
        this.dispatchConditionalEvent("keyup", event);
    };

    private touchMove = (event: TouchEvent) => {
        if (event.changedTouches.length > 1) {
            return;
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

    private touchUp = (event: TouchEvent) => {
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

    private touchDown = (event: TouchEvent) => {
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

    private bindEvent() {
        this.el.addEventListener("contextmenu", this.onContextMenu);
        window.addEventListener("resize", this.onResize);
        window.addEventListener("load", this.onResize);

        this.el.addEventListener("keydown", this.onKeydown);
        this.el.addEventListener("keyup", this.onKeyup);

        this.el.addEventListener("wheel", this.onMouseWheel);
        this.el.addEventListener("mousedown", this.onMousedown);
        this.el.addEventListener("mousemove", this.onMousemove);
        this.el.addEventListener("mouseout", this.onMouseOut);
        this.el.addEventListener("mouseup", this.onMouseUp);
        this.el.addEventListener("click", this.onClick);
        this.el.addEventListener("dblclick", this.onDoubleClick);

        this.el.addEventListener("touchstart", this.touchDown);
        this.el.addEventListener("touchmove", this.touchMove);
        this.el.addEventListener("touchend", this.touchUp);
    }

    public clearEvent = () => {
        this.el.removeEventListener("contextmenu", this.onContextMenu);
        window.removeEventListener("resize", this.onResize);
        window.removeEventListener("load", this.onResize);

        this.el.removeEventListener("keydown", this.onKeydown);
        this.el.removeEventListener("keyup", this.onKeyup);

        this.el.removeEventListener("wheel", this.onMouseWheel);
        this.el.removeEventListener("mousedown", this.onMousedown);
        this.el.removeEventListener("mousemove", this.onMousemove);
        this.el.removeEventListener("mouseout", this.onMouseOut);
        this.el.removeEventListener("mouseup", this.onMouseUp);
        this.el.removeEventListener("click", this.onClick);
        this.el.removeEventListener("dblclick", this.onDoubleClick);

        this.el.removeEventListener("touchstart", this.touchDown);
        this.el.removeEventListener("touchmove", this.touchMove);
        this.el.removeEventListener("touchend", this.touchUp);
    };

    public setSize(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.center_x = w * 0.5;
        this.center_y = h * 0.5;
        this.el.style.width = w + "px";
        this.el.style.height = h + "px";
    }

    private checkNeedDraw(): boolean {
        // Check if mouse state changed
        if (!this.__preMouseDown) {
            this.__preMouseDown = [...this.mouseDown];
            return true; // Initial state always needs draw
        }

        const [a, b, c] = this.__preMouseDown;
        const [a1, b1, c1] = this.mouseDown;

        // If any mouse button state changed
        if (a !== a1 || b !== b1 || c !== c1) {
            this.__preMouseDown = [...this.mouseDown];
            return true;
        }

        // If panEnabled state changed
        if (this.__panEnabled !== this.panEnabled) {
            this.__panEnabled = this.panEnabled;
            return true;
        }

        // If zoomEnabled state changed
        if (this.__zoomEnabled !== this.zoomEnabled) {
            this.__zoomEnabled = this.zoomEnabled;
            return true;
        }

        // If mouse is down and position changed
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

        // If mouse wheel changed
        if (this.__lastMouseZ !== this.lastMouseZ) {
            this.__lastMouseZ = this.lastMouseZ;
            return true;
        }

        return false;
    }
}

export { WindowEventHandler };
