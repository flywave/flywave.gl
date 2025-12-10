/* 
 * Copyright (C) 2025 flywave.gl contributors
 * 
 * WindowEventHandler - 统一处理窗口事件的类，支持鼠标、键盘和触摸事件
 * 提供事件分发和状态管理功能，适用于交互式图形应用
 */

import { EventDispatcher, Vector2 } from "three";

/**
 * 窗口事件映射接口
 * 定义了所有支持的事件类型及其对应的事件对象
 */
interface WindowEventMap {
    mousemove: MouseEvent;
    mouseup: MouseEvent;
    mouseout: MouseEvent;
    dblclick: MouseEvent;
    premouseclick: MouseEvent;  // 鼠标点击前事件
    mouseclick: MouseEvent;     // 鼠标点击事件
    realclick: MouseEvent;      // 实际点击事件
    rightclick: MouseEvent;     // 右键点击事件
    keydown: KeyboardEvent;
    keyup: KeyboardEvent;
    premousedown: MouseEvent;   // 鼠标按下前事件
    mousedown: MouseEvent;
    mousewheel: WheelEvent;
    mousedraw: MouseEvent;      // 鼠标绘制事件
}

/**
 * 窗口事件处理器类
 * 负责管理鼠标、键盘和触摸事件，并提供事件分发功能
 */
class WindowEventHandler extends EventDispatcher<WindowEventMap> {
    // 鼠标按钮状态数组 [左键, 中键, 右键]
    public mouseDown: [boolean, boolean, boolean] = [false, false, false];

    // 功能开关
    private _panEnabled: boolean = true;
    public zoomEnabled: boolean = true;
    public doubleZoomEnable: boolean = true;

    // 鼠标位置状态
    public lastMouseX: number = 0;
    public lastMouseY: number = 0;
    public lastMouseZ: number = 0;  // 用于滚轮状态

    // 窗口尺寸信息
    public center_x: number = 0;
    public center_y: number = 0;
    public width: number = 600;
    public height: number = 300;

    private readonly el: HTMLElement;
    private _lastMouseDownPoint: Vector2 | null = null;
    private _clickTimeId: number | null = null;

    // 状态缓存，用于检测变化
    private __preMouseDown?: [boolean, boolean, boolean];
    private __panEnabled?: boolean;
    private __zoomEnabled?: boolean;
    private __lastMouseX?: number;
    private __lastMouseY?: number;
    private __lastMouseZ?: number;

    /**
     * 构造函数
     * @param el - 要绑定事件的HTML元素
     */
    constructor(el: HTMLElement) {
        super();
        this.el = el;
        this.bindEvent();
    }

    /**
     * 设置平移功能是否启用
     */
    set panEnabled(v: boolean) {
        this._panEnabled = v;
        // 禁用时重置所有鼠标按钮状态
        this.mouseDown[0] = false;
        this.mouseDown[1] = false;
        this.mouseDown[2] = false;
    }

    /**
     * 获取平移功能启用状态
     */
    get panEnabled(): boolean {
        return this._panEnabled;
    }

    private createEventProxy<T extends keyof WindowEventMap>(
        type: T,
        originalEvent: WindowEventMap[T]
    ): any {
        // 创建一个空对象作为代理目标
        const proxyTarget = {};

        return new Proxy(proxyTarget, {
            get: (target, prop: string | symbol, receiver) => {
                // 固定属性
                if (prop === 'type') return type;

                // 从代理目标中获取（Three.js 设置的属性）
                if (prop in target) {
                    return Reflect.get(target, prop, receiver);
                }

                // 从原始事件中获取
                if (prop in originalEvent) {
                    const value = (originalEvent as any)[prop];
                    return typeof value === 'function' ? value.bind(originalEvent) : value;
                }

                return undefined;
            },

            set: (target, prop: string | symbol, value: any, receiver) => {
                // 允许设置任何属性到代理目标
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

                // 先从代理目标中获取描述符
                const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, prop);
                if (targetDescriptor) return targetDescriptor;

                // 再从原始事件中获取
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
     * 条件性分发事件
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

    // ==================== 事件处理函数 ====================

    /**
     * 鼠标滚轮事件处理
     */
    private readonly onMouseWheel = (event: WheelEvent) => {
        if (!this.zoomEnabled) {
            return;
        }

        let wheelDelta = 0;

        // 计算滚轮增量
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
     * 窗口尺寸变化事件处理
     */
    private readonly onResize = () => {
        let offsetWidth: number, offsetHeight: number;

        // 获取父元素或窗口的尺寸
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
     * 右键菜单事件处理（阻止默认行为）
     */
    private readonly onContextMenu = (event: MouseEvent) => {
        event.preventDefault();
    };

    /**
     * 鼠标按下事件处理
     */
    private readonly onMousedown = (event: MouseEvent) => {
        const button = event.button;
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        // 分发按下前事件
        this.dispatchConditionalEvent("premousedown", event);

        // 根据按钮设置状态
        if (button === 0) {
            this.mouseDown[0] = this._panEnabled;  // 左键受平移功能控制
        } else if (button === 1) {
            this.mouseDown[1] = true;  // 中键
        } else if (button === 2) {
            this.mouseDown[2] = true;  // 右键
        }

        // 记录按下位置用于点击检测
        this._lastMouseDownPoint = new Vector2(event.offsetX, event.offsetY);
        this.dispatchConditionalEvent("mousedown", event);
    };

    /**
     * 鼠标移动事件处理
     */
    private readonly onMousemove = (event: MouseEvent) => {
        event.preventDefault();
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        this.dispatchConditionalEvent("mousemove", event);
    };

    /**
     * 鼠标移出事件处理
     */
    private readonly onMouseOut = (event: MouseEvent) => {
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;
        // 移出时重置所有鼠标按钮状态
        this.mouseDown[0] = false;
        this.mouseDown[1] = false;
        this.mouseDown[2] = false;

        event.stopPropagation();
        this.dispatchConditionalEvent("mouseout", event);
    };

    /**
     * 鼠标释放事件处理
     */
    private readonly onMouseUp = (event: MouseEvent) => {
        const button = event.button;
        this.lastMouseX = event.offsetX;
        this.lastMouseY = event.offsetY;

        // 根据按钮重置状态
        if (button === 0) {
            this.mouseDown[0] = false;
        } else if (button === 1) {
            this.mouseDown[1] = false;
        } else if (button === 2) {
            this.mouseDown[2] = false;
        }

        this.dispatchConditionalEvent("mouseup", event);
        this.onRightClick(event);  // 检查右键点击
    };

    /**
     * 鼠标点击事件处理
     */
    private readonly onClick = (event: MouseEvent) => {
        const point = new Vector2(event.offsetX, event.offsetY);

        // 检查是否为有效点击（移动距离小于3像素）
        if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
            // 延迟分发点击事件，避免与双击冲突
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
     * 右键点击检测
     */
    private readonly onRightClick = (event: MouseEvent) => {
        if (event.button === 2) {
            const point = new Vector2(event.offsetX, event.offsetY);
            // 检查是否为有效右键点击
            if (this._lastMouseDownPoint && this._lastMouseDownPoint.distanceTo(point) <= 3) {
                this.dispatchConditionalEvent("rightclick", event);
            }
        }
    };

    /**
     * 双击事件处理
     */
    private readonly onDoubleClick = (event: MouseEvent) => {
        if (!this.zoomEnabled) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();

        // 清除可能的单击定时器
        if (this._clickTimeId) {
            clearTimeout(this._clickTimeId);
            this._clickTimeId = null;
        }

        // 双击缩放功能
        if (this.doubleZoomEnable) {
            this.lastMouseX = event.offsetX;
            this.lastMouseY = event.offsetY;
            this.lastMouseZ += 10;  // 模拟滚轮增量
        }

        this.dispatchConditionalEvent("dblclick", event);
    };

    /**
     * 键盘按下事件处理
     */
    private readonly onKeydown = (event: KeyboardEvent) => {
        this.dispatchConditionalEvent("keydown", event);
    };

    /**
     * 键盘释放事件处理
     */
    private readonly onKeyup = (event: KeyboardEvent) => {
        this.dispatchConditionalEvent("keyup", event);
    };

    // ==================== 触摸事件处理 ====================

    /**
     * 触摸移动事件处理（转换为鼠标事件）
     */
    private readonly touchMove = (event: TouchEvent) => {
        if (event.changedTouches.length > 1) {
            return;  // 忽略多点触控
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
     * 触摸结束事件处理（转换为鼠标事件）
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
     * 触摸开始事件处理（转换为鼠标事件）
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

    // ==================== 公共方法 ====================

    /**
     * 绑定所有事件监听器
     */
    private bindEvent() {
        // 鼠标事件
        this.el.addEventListener("contextmenu", this.onContextMenu);
        this.el.addEventListener("wheel", this.onMouseWheel);
        this.el.addEventListener("mousedown", this.onMousedown);
        this.el.addEventListener("mousemove", this.onMousemove);
        this.el.addEventListener("mouseout", this.onMouseOut);
        this.el.addEventListener("mouseup", this.onMouseUp);
        this.el.addEventListener("click", this.onClick);
        this.el.addEventListener("dblclick", this.onDoubleClick);

        // 键盘事件
        this.el.addEventListener("keydown", this.onKeydown);
        this.el.addEventListener("keyup", this.onKeyup);

        // 触摸事件
        this.el.addEventListener("touchstart", this.touchDown);
        this.el.addEventListener("touchmove", this.touchMove);
        this.el.addEventListener("touchend", this.touchUp);

        // 窗口事件
        window.addEventListener("resize", this.onResize);
        window.addEventListener("load", this.onResize);
    }

    /**
     * 清理所有事件监听器
     */
    public clearEvent = () => {
        // 鼠标事件
        this.el.removeEventListener("contextmenu", this.onContextMenu);
        this.el.removeEventListener("wheel", this.onMouseWheel);
        this.el.removeEventListener("mousedown", this.onMousedown);
        this.el.removeEventListener("mousemove", this.onMousemove);
        this.el.removeEventListener("mouseout", this.onMouseOut);
        this.el.removeEventListener("mouseup", this.onMouseUp);
        this.el.removeEventListener("click", this.onClick);
        this.el.removeEventListener("dblclick", this.onDoubleClick);

        // 键盘事件
        this.el.removeEventListener("keydown", this.onKeydown);
        this.el.removeEventListener("keyup", this.onKeyup);

        // 触摸事件
        this.el.removeEventListener("touchstart", this.touchDown);
        this.el.removeEventListener("touchmove", this.touchMove);
        this.el.removeEventListener("touchend", this.touchUp);

        // 窗口事件
        window.removeEventListener("resize", this.onResize);
        window.removeEventListener("load", this.onResize);
    };

    /**
     * 设置元素尺寸
     * @param w - 宽度
     * @param h - 高度
     */
    public setSize(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.center_x = w * 0.5;
        this.center_y = h * 0.5;
        this.el.style.width = w + "px";
        this.el.style.height = h + "px";
    }

    // ==================== 私有方法 ====================

    /**
     * 检查是否需要触发绘制事件
     * 基于鼠标状态、功能开关和位置变化进行判断
     * @returns 是否需要绘制
     */
    private checkNeedDraw(): boolean {
        // 初始化状态缓存
        if (!this.__preMouseDown) {
            this.__preMouseDown = [...this.mouseDown];
            return true; // 初始状态总是需要绘制
        }

        const [a, b, c] = this.__preMouseDown;
        const [a1, b1, c1] = this.mouseDown;

        // 检查鼠标按钮状态变化
        if (a !== a1 || b !== b1 || c !== c1) {
            this.__preMouseDown = [...this.mouseDown];
            return true;
        }

        // 检查平移功能状态变化
        if (this.__panEnabled !== this.panEnabled) {
            this.__panEnabled = this.panEnabled;
            return true;
        }

        // 检查缩放功能状态变化
        if (this.__zoomEnabled !== this.zoomEnabled) {
            this.__zoomEnabled = this.zoomEnabled;
            return true;
        }

        // 检查鼠标按下时的位置变化
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

        // 检查滚轮状态变化
        if (this.__lastMouseZ !== this.lastMouseZ) {
            this.__lastMouseZ = this.lastMouseZ;
            return true;
        }

        return false;
    }
}

export { WindowEventHandler };