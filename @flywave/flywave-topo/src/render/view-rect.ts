import { LowAndHighXY, XAndY } from "../core-geometry";

export class ViewRect {
    private _left!: number;
    private _top!: number;
    private _right!: number;
    private _bottom!: number;

    private _set(key: "_left" | "_right" | "_top" | "_bottom", value: number): void {
        this[key] = Math.max(0, Math.floor(value));
    }

    public constructor(left = 0, top = 0, right = 0, bottom = 0) {
        this.init(left, top, right, bottom);
    }

    public get left(): number {
        return this._left;
    }

    public set left(val: number) {
        this._set("_left", val);
    }

    public get top(): number {
        return this._top;
    }

    public set top(val: number) {
        this._set("_top", val);
    }

    public get right(): number {
        return this._right;
    }

    public set right(val: number) {
        this._set("_right", val);
    }

    public get bottom(): number {
        return this._bottom;
    }

    public set bottom(val: number) {
        this._set("_bottom", val);
    }

    public get isNull(): boolean {
        return this.right <= this.left || this.bottom <= this.top;
    }

    public get isValid(): boolean {
        return !this.isNull;
    }

    public get width() {
        return this.right - this.left;
    }

    public set width(width: number) {
        this.right = this.left + width;
    }

    public get height() {
        return this.bottom - this.top;
    }

    public set height(height: number) {
        this.bottom = this.top + height;
    }

    public get aspect() {
        return this.isNull ? 1.0 : this.width / this.height;
    }

    public get area() {
        return this.isNull ? 0 : this.width * this.height;
    }

    public init(left: number, top: number, right: number, bottom: number) {
        this.left = left;
        this.bottom = bottom;
        this.right = right;
        this.top = top;
    }

    public initFromPoints(topLeft: XAndY, bottomRight: XAndY): void {
        this.init(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
    }

    public initFromRange(input: LowAndHighXY): void {
        this.initFromPoints(input.low, input.high);
    }

    public equals(other: ViewRect): boolean {
        return (
            this.left === other.left &&
            this.right === other.right &&
            this.bottom === other.bottom &&
            this.top === other.top
        );
    }

    public setFrom(other: ViewRect): void {
        this.init(other.left, other.top, other.right, other.bottom);
    }

    public clone(result?: ViewRect): ViewRect {
        if (undefined !== result) {
            result.setFrom(this);
            return result;
        }
        return new ViewRect(this.left, this.top, this.right, this.bottom);
    }

    public extend(other: ViewRect) {
        if (this.left > other.left) this.left = other.left;
        if (this.top > other.top) this.top = other.top;
        if (this.right < other.right) this.right = other.right;
        if (this.bottom < other.bottom) this.bottom = other.bottom;
    }

    public inset(deltaX: number, deltaY: number): void {
        deltaX = Math.floor(deltaX);
        deltaY = Math.floor(deltaY);
        if (this.width - 2 * deltaX <= 0 || this.height - 2 * deltaY <= 0) {
            this.init(0, 0, 0, 0);
            return;
        }
        this._left += deltaX;
        this._right -= deltaX;
        this._top += deltaY;
        this._bottom -= deltaY;
    }

    public insetUniform(offset: number): void {
        this.inset(offset, offset);
    }

    public scaleAboutCenter(xScale: number, yScale: number): void {
        const w = this.width;
        const h = this.height;
        const xDelta = (w - w * xScale) * 0.5;
        const yDelta = (h - h * yScale) * 0.5;
        this.inset(xDelta, yDelta);
    }

    public insetByPercent(percent: number): void {
        this.insetUniform(this.width * percent);
    }

    public isContained(other: ViewRect): boolean {
        return (
            this.left >= other.left &&
            this.right <= other.right &&
            this.bottom <= other.bottom &&
            this.top >= other.top
        );
    }

    public containsPoint(point: XAndY): boolean {
        return (
            point.x >= this.left &&
            point.x < this.right &&
            point.y >= this.top &&
            point.y < this.bottom
        );
    }

    public overlaps(other: ViewRect): boolean {
        return (
            this.left <= other.right &&
            this.top <= other.bottom &&
            this.right >= other.left &&
            this.bottom >= other.top
        );
    }

    public computeOverlap(other: ViewRect, out?: ViewRect): ViewRect | undefined {
        const maxOrgX = Math.max(this.left, other.left);
        const maxOrgY = Math.max(this.top, other.top);
        const minCrnX = Math.min(this.right, other.right);
        const minCrnY = Math.min(this.bottom, other.bottom);

        if (maxOrgX > minCrnX || maxOrgY > minCrnY) return undefined;

        const result = undefined !== out ? out : new ViewRect();
        result.left = maxOrgX;
        result.right = minCrnX;
        result.top = maxOrgY;
        result.bottom = minCrnY;
        return result;
    }
}
