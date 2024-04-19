import { dispatch } from "d3-dispatch";
import { Vector2 } from "three";

class Window {
    dispatch = dispatch(
        "mousemove",
        "mouseup",
        "mouseout",
        "dblclick",
        "premouseclick",
        "mouseclick",
        "realclick",
        "rightclick",
        "keydown",
        "keyup",
        "premousedown",
        "mousedown",
        "mousewheel",
        "mousedraw"
    );

    mouseDown = [false, false, false];

    _panEnabled = true;
    zoomEnabled = true;
    doubleZoomEnable = true;

    set panEnabled(v) {
        this._panEnabled = v;
        this.mouseDown[0] = false;
        this.mouseDown[1] = false;
        this.mouseDown[2] = false;
    }

    get panEnabled() {
        return this._panEnabled;
    }

    lastMouseX = 0;
    lastMouseY = 0;
    lastMouseZ = 0;

    center_x = 0;
    center_y = 0;

    width = 600;
    height = 300;

    constructor(el) {
        this.el = el;
        this.bindEvent();
    }

    onMouseWheel = event => {
        if (!this.zoomEnabled) {
            return;
        }
        var wheelDelta = 0;
        if (!event) {
            event = window.event;
        }
        if (event.wheelDelta) {
            wheelDelta = (event.wheelDelta / 120) * 2;
            if (window.opera) {
                wheelDelta = -wheelDelta;
            }
        } else {
            if (event.deltaY) {
                wheelDelta = (-event.deltaY / 3) * 2;
            }
        }
        if (wheelDelta) {
            this.lastMouseZ += wheelDelta;
        }
        if (event.preventDefault) {
            event.preventDefault();
        }
        event.returnValue = false;
        this.fire("mousewheel", event);
    };

    onResize = () => {
        var offsetWidth, offsetHeight;
        if (dom.parentNode && dom.parentNode.offsetWidth) {
            offsetWidth = dom.parentNode.offsetWidth;
        } else {
            offsetWidth = dom.innerWidth || 320;
        }
        if (dom.parentNode && dom.parentNode.offsetHeight) {
            offsetHeight = dom.parentNode.offsetHeight;
        } else {
            offsetHeight = dom.innerHeight || 320;
        }
        this.setSize(offsetWidth, offsetHeight);
    };

    onContextMenu = event => {
        event.preventDefault();
    };

    onMousedown = event => {
        var button = event.button,
            mouseDown = this.mouseDown;

        this.lastMouseX = event.layerX;
        this.lastMouseY = event.layerY;

        this.fire("premousedown", event);

        if (button === 0) {
            mouseDown[0] = this._panEnabled;
        } else {
            if (button === 1) {
                mouseDown[1] = true;
            } else {
                if (button === 2) {
                    mouseDown[2] = true;
                }
            }
        }

        this._lastMouseDownPoint = new Vector2(event.layerX, event.layerY);
        this.fire("mousedown", event);
    };

    onMousemove = event => {
        if (event.preventDefault) {
            event.preventDefault();
        }
        this.lastMouseX = event.layerX;
        this.lastMouseY = event.layerY;

        this._lastMouseMovePoint = new Vector2(event.layerX, event.layerY);

        this.fire("mousemove", event);
    };

    onMouseOut = event => {
        var mouseDown = this.mouseDown;

        this.lastMouseX = event.layerX;
        this.lastMouseY = event.layerY;
        mouseDown[0] = false;
        mouseDown[1] = false;
        mouseDown[2] = false;
        event.stopPropagation();
        this.fire("mouseout", event);
    };

    onMouseUp = event => {
        var button = event.button,
            mouseDown = this.mouseDown;

        this.lastMouseX = event.layerX;
        this.lastMouseY = event.layerY;

        if (button === 0) {
            mouseDown[0] = false;
        } else {
            if (button === 1) {
                mouseDown[1] = false;
            } else {
                if (button === 2) {
                    mouseDown[2] = false;
                }
            }
        }
        this.fire("mouseup", event);
        this.onRightClick(event);
    };

    onClick = event => {
        var point = new Vector2(event.layerX, event.layerY);
        if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
            this._clickTimeId = setTimeout(() => {
                if (this._clickTimeId) {
                    this.fire("premouseclick", event);
                    this.fire("mouseclick", event);
                }
            }, 200);

            this.fire("realclick", event);
            this._lastMouseClickPoint = point;
        }
    };

    onRightClick = event => {
        if (event.button == 2) {
            var point = new Vector2(event.layerX, event.layerY);
            if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
                this.fire("rightclick", event);
            }
        }
    };

    onDoubleClick = event => {
        if (!this.zoomEnabled) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();
        if (this._clickTimeId) {
            clearTimeout(this._clickTimeId);
            this._clickTimeId = 0;
        }
        if (this.doubleZoomEnable) {
            this.lastMouseX = event.layerX;
            this.lastMouseY = event.layerY;
            this.lastMouseZ += 10;
        }
        this.fire("dblclick", event);
    };

    onKeydown = event => {
        this.fire("keydown", event);
    };

    onKeyup = event => {
        this.fire("keyup", event);
    };

    touchMove = event => {
        if (event.changedTouches.length > 1) {
            return;
        }
        event.changedTouches[0].button = 0;
        event.preventDefault();
        this.onMousemove(event.changedTouches[0]);
    };

    touchUp = event => {
        if (event.changedTouches.length > 1) {
            return;
        }
        event.preventDefault();
        event.changedTouches[0].button = 0;
        this.onMouseUp(event.changedTouches[0]);
    };

    touchDown = event => {
        if (event.changedTouches.length > 1) {
            return;
        }
        event.preventDefault();
        event.changedTouches[0].button = 0;
        this.onMousedown(event.changedTouches[0]);
    };

    bindEvent() {
        var el = this.el;
        el.addEventListener("contextmenu", this.onContextMenu);
        el.addEventListener("resize", this.onResize);
        el.addEventListener("onload", this.onResize, false);

        el.addEventListener("onkeydown", this.onKeydown);
        el.addEventListener("onkeyup", this.onKeyup);

        el.addEventListener("wheel", this.onMouseWheel);
        el.addEventListener("mousedown", this.onMousedown);
        el.addEventListener("mousemove", this.onMousemove);
        el.addEventListener("mouseout", this.onMouseOut);
        el.addEventListener("mouseup", this.onMouseUp);
        el.addEventListener("click", this.onClick, false);
        el.addEventListener("dblclick", this.onDoubleClick, false);

        el.addEventListener("touchstart", this.touchDown);
        el.addEventListener("touchmove", this.touchMove);
        el.addEventListener("touchend", this.touchUp);
    }

    clearEvent = () => {
        var el = this.el;
        el.removeEventListener("contextmenu", this.onContextMenu);
        el.removeEventListener("resize", this.onResize);
        el.removeEventListener("onload", this.onResize);

        el.removeEventListener("onkeydown", this.onKeydown);
        el.removeEventListener("onkeyup", this.onKeyup);

        el.removeEventListener("wheel", this.onMouseWheel);
        el.removeEventListener("mousedown", this.onMousedown);
        el.removeEventListener("mousemove", this.onMousemove);
        el.removeEventListener("mouseout", this.onMouseOut);
        el.removeEventListener("mouseup", this.onMouseOut);
        el.removeEventListener("click", this.onClick);
        el.removeEventListener("dblclick", this.onDoubleClick);

        el.removeEventListener("touchstart", this.touchDown);
        el.removeEventListener("touchmove", this.touchMove);
        el.removeEventListener("touchend", this.touchUp);
    };

    setSize(w, h) {
        this.width = w;
        this.height = h;
        this.center_x = w * 0.5;
        this.center_y = h * 0.5;
        this.dom.style.width = w + "px";
        this.dom.style.height = h + "px";
    }

    on() {
        this.dispatch.on.apply(this.dispatch, arguments);
        return this;
    }

    fire(name, ...argument) {
        this.dispatch.call(name, this, ...argument);
        if (this.checkNeedDraw()) {
            this.dispatch.call("mousedraw", this, ...argument);
        }
    }

    checkNeedDraw = () => {
        if (!this.__preMouseDown) {
            this.__preMouseDown = this.mouseDown.slice();
        }
        const [a, b, c] = this.__preMouseDown;
        const [a1, b1, c1] = this.mouseDown;
        if (a != a1 || b != b1 || c != c1) {
            this.__preMouseDown = this.mouseDown.slice();
            return true;
        }

        if (this.__panEnabled != this.panEnabled) {
            this.__panEnabled = this.panEnabled;
            return true;
        }
        if (this.__zoomEnabled != this.zoomEnabled) {
            this.__zoomEnabled = this.zoomEnabled;
            return true;
        }

        if (a || b || c) {
            if (this.__lastMouseX != this.lastMouseX) {
                this.__lastMouseX = this.lastMouseX;
                return true;
            }

            if (this.__lastMouseY != this.lastMouseY) {
                this.__lastMouseY = this.lastMouseY;
                return true;
            }
        }

        if (this.__lastMouseZ != this.lastMouseZ) {
            this.__lastMouseZ = this.lastMouseZ;
            return true;
        }
        return false;
    };
}

export default Window;
