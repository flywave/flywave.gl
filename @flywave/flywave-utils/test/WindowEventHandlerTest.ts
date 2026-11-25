/* Copyright (C) 2025 flywave.gl contributors */

import { assert } from "chai";

import { WindowEventHandler } from "../src/WindowEventHandler";

/**
 * Test rig: an absolutely positioned element so that the canvas-local
 * conversion (client minus element origin) can be asserted with an offset.
 * Element origin: left 25, top 40.
 */
const OFFSET_X = 25;
const OFFSET_Y = 40;

interface TouchPoint {
    /** Canvas-local position; client position is derived from it. */
    x: number;
    y: number;
    id: number;
}

function makeTouch(el: HTMLElement, point: TouchPoint): Touch {
    return new Touch({
        identifier: point.id,
        target: el,
        clientX: point.x + OFFSET_X,
        clientY: point.y + OFFSET_Y
    });
}

function fireTouch(
    el: HTMLElement,
    type: string,
    all: TouchPoint[],
    changed: TouchPoint[]
): boolean {
    const touches = all.map(point => makeTouch(el, point));
    const changedTouches = changed.map(point => makeTouch(el, point));
    const event = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches,
        targetTouches: touches,
        changedTouches
    });
    return !el.dispatchEvent(event);
}

describe("WindowEventHandler", function () {
    let el: HTMLElement;
    let handler: WindowEventHandler;

    beforeEach(function () {
        el = document.createElement("div");
        el.style.cssText =
            "position:absolute;left:25px;top:40px;width:300px;height:200px;background:#eee;";
        document.body.appendChild(el);
        handler = new WindowEventHandler(el);
    });

    afterEach(function () {
        handler.clearEvent();
        el.remove();
    });

    describe("touch to mouse conversion", function () {
        it("maps touch coordinates to canvas-local mouse state", function () {
            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);

            assert.equal(handler.lastMouseX, 100, "lastMouseX should be canvas-local");
            assert.equal(handler.lastMouseY, 50, "lastMouseY should be canvas-local");
            assert.isTrue(handler.mouseDown[0], "left button should be pressed");
        });

        it("dispatches mousedown/mousemove/mouseup for a single finger", function () {
            const fired: string[] = [];
            handler.addEventListener("mousedown", () => fired.push("mousedown"));
            handler.addEventListener("mousemove", () => fired.push("mousemove"));
            handler.addEventListener("mouseup", () => fired.push("mouseup"));

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(el, "touchmove", [{ id: 1, x: 150, y: 80 }], [{ id: 1, x: 150, y: 80 }]);
            assert.equal(handler.lastMouseX, 150);
            assert.equal(handler.lastMouseY, 80);
            fireTouch(el, "touchend", [], [{ id: 1, x: 150, y: 80 }]);

            assert.deepEqual(fired, ["mousedown", "mousemove", "mouseup"]);
            assert.isFalse(handler.mouseDown[0]);
        });

        it("keeps the mouse path parity for dispatched DOM events", function () {
            const mouseEvent = new MouseEvent("mousedown", {
                clientX: 100 + OFFSET_X,
                clientY: 50 + OFFSET_Y,
                button: 0
            });
            el.dispatchEvent(mouseEvent);

            assert.equal(handler.lastMouseX, 100, "DOM event offsetX should be canvas-local");
            assert.equal(handler.lastMouseY, 50);
        });
    });

    describe("tap and click synthesis", function () {
        it("synthesizes realclick immediately and mouseclick after the delay", function (done) {
            const fired: string[] = [];
            handler.addEventListener("realclick", () => fired.push("realclick"));
            handler.addEventListener("mouseclick", () => fired.push("mouseclick"));

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(el, "touchend", [], [{ id: 1, x: 100, y: 50 }]);

            assert.deepEqual(fired, ["realclick"], "realclick should be synchronous");

            setTimeout(() => {
                assert.deepEqual(fired, ["realclick", "mouseclick"]);
                done();
            }, 400);
        });

        it("does not synthesize a click when the finger moved", function (done) {
            const fired: string[] = [];
            handler.addEventListener("realclick", () => fired.push("realclick"));
            handler.addEventListener("mouseclick", () => fired.push("mouseclick"));

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(el, "touchmove", [{ id: 1, x: 150, y: 80 }], [{ id: 1, x: 150, y: 80 }]);
            fireTouch(el, "touchend", [], [{ id: 1, x: 150, y: 80 }]);

            setTimeout(() => {
                assert.isEmpty(fired, "a drag must not produce click events");
                done();
            }, 400);
        });

        it("zooms on a double tap (dblclick + wheel state) without a stray click", function (done) {
            const fired: string[] = [];
            handler.addEventListener("dblclick", () => fired.push("dblclick"));
            handler.addEventListener("mouseclick", () => fired.push("mouseclick"));

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(el, "touchend", [], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(el, "touchstart", [{ id: 2, x: 105, y: 55 }], [{ id: 2, x: 105, y: 55 }]);
            fireTouch(el, "touchend", [], [{ id: 2, x: 105, y: 55 }]);

            assert.include(fired, "dblclick", "dblclick should be synchronous");
            assert.equal(handler.lastMouseZ, 10, "double tap zoom adds the wheel delta");

            setTimeout(() => {
                assert.notInclude(fired, "mouseclick", "single click must be cancelled");
                done();
            }, 400);
        });
    });

    describe("two finger gestures", function () {
        it("keeps the pointer continuous when the second finger lands", function () {
            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);

            // Second finger lands: no second press, pointer must not jump.
            fireTouch(
                el,
                "touchstart",
                [
                    { id: 1, x: 100, y: 50 },
                    { id: 2, x: 300, y: 50 }
                ],
                [{ id: 2, x: 300, y: 50 }]
            );

            assert.equal(handler.lastMouseX, 100, "pointer must stay at the first finger");
            assert.equal(handler.lastMouseY, 50);
            assert.equal(handler.lastMouseZ, 0, "no zoom on pinch entry");
        });

        it("pinch distance changes feed the wheel state, midpoint feeds the pointer", function () {
            const mouseDowns: string[] = [];
            handler.addEventListener("mousedown", () => mouseDowns.push("down"));

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(
                el,
                "touchstart",
                [
                    { id: 1, x: 100, y: 50 },
                    { id: 2, x: 300, y: 50 }
                ],
                [{ id: 2, x: 300, y: 50 }]
            );
            // Spread: distance 200 -> 300, ratio 1.5.
            fireTouch(
                el,
                "touchmove",
                [
                    { id: 1, x: 100, y: 50 },
                    { id: 2, x: 400, y: 50 }
                ],
                [{ id: 2, x: 400, y: 50 }]
            );

            assert.lengthOf(mouseDowns, 1, "only the first finger presses");
            assert.isAbove(handler.lastMouseZ, 0, "spreading fingers zooms in");
            // Midpoint (250,50) + continuity offset (-100,0) = (150,50).
            assert.equal(handler.lastMouseX, 150);
            assert.equal(handler.lastMouseY, 50);
        });

        it("keeps the drag alive while one of two fingers lifts", function () {
            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(
                el,
                "touchstart",
                [
                    { id: 1, x: 100, y: 50 },
                    { id: 2, x: 300, y: 50 }
                ],
                [{ id: 2, x: 300, y: 50 }]
            );
            fireTouch(
                el,
                "touchmove",
                [
                    { id: 1, x: 100, y: 50 },
                    { id: 2, x: 400, y: 50 }
                ],
                [{ id: 2, x: 400, y: 50 }]
            );

            let mouseUpCount = 0;
            handler.addEventListener("mouseup", () => mouseUpCount++);

            fireTouch(el, "touchend", [{ id: 1, x: 100, y: 50 }], [{ id: 2, x: 400, y: 50 }]);

            assert.equal(mouseUpCount, 0, "lifting one finger must not end the drag");
            assert.isTrue(handler.mouseDown[0]);

            // The remaining finger pans: virtual pointer follows without jump.
            fireTouch(el, "touchmove", [{ id: 1, x: 120, y: 50 }], [{ id: 1, x: 120, y: 50 }]);
            // Offset after lift: lastMouse(150) - remaining finger (100) = 50.
            assert.equal(handler.lastMouseX, 170);

            fireTouch(el, "touchend", [], [{ id: 1, x: 120, y: 50 }]);
            assert.equal(mouseUpCount, 1, "the last lifted finger ends the drag");
            assert.isFalse(handler.mouseDown[0]);
        });

        it("accumulates twist radians and resets on take", function () {
            handler.clearEvent();
            handler = new WindowEventHandler(el);

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 100 }], [{ id: 1, x: 100, y: 100 }]);
            fireTouch(
                el,
                "touchstart",
                [
                    { id: 1, x: 100, y: 100 },
                    { id: 2, x: 200, y: 100 }
                ],
                [{ id: 2, x: 200, y: 100 }]
            );
            // Rotate finger 2 by +45 degrees (clockwise on screen).
            fireTouch(
                el,
                "touchmove",
                [
                    { id: 1, x: 100, y: 100 },
                    { id: 2, x: 200, y: 200 }
                ],
                [{ id: 2, x: 200, y: 200 }]
            );

            const twist = handler.takeTwistDelta();
            assert.approximately(twist, Math.PI / 4, 0.01);
            assert.equal(handler.takeTwistDelta(), 0, "accumulator must reset on take");

            fireTouch(el, "touchend", [{ id: 1, x: 100, y: 100 }], [{ id: 2, x: 200, y: 200 }]);
            fireTouch(el, "touchend", [], [{ id: 1, x: 100, y: 100 }]);
        });

        it("does not synthesize clicks from a pinch gesture", function (done) {
            const fired: string[] = [];
            handler.addEventListener("mouseclick", () => fired.push("mouseclick"));

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(
                el,
                "touchstart",
                [
                    { id: 1, x: 100, y: 50 },
                    { id: 2, x: 300, y: 50 }
                ],
                [{ id: 2, x: 300, y: 50 }]
            );
            fireTouch(el, "touchend", [{ id: 1, x: 100, y: 50 }], [{ id: 2, x: 300, y: 50 }]);
            fireTouch(el, "touchend", [], [{ id: 1, x: 100, y: 50 }]);

            setTimeout(() => {
                assert.isEmpty(fired);
                done();
            }, 400);
        });
    });

    describe("touch cancel and cleanup", function () {
        it("touchcancel releases the gesture without click synthesis", function (done) {
            const fired: string[] = [];
            handler.addEventListener("mouseup", () => fired.push("mouseup"));
            handler.addEventListener("mouseclick", () => fired.push("mouseclick"));

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            fireTouch(el, "touchcancel", [], [{ id: 1, x: 120, y: 50 }]);

            assert.isFalse(handler.mouseDown[0], "cancel must release the pressed state");

            // A late move for the canceled touch is ignored.
            fireTouch(el, "touchmove", [{ id: 1, x: 200, y: 50 }], [{ id: 1, x: 200, y: 50 }]);
            assert.equal(handler.lastMouseX, 100);

            setTimeout(() => {
                assert.deepEqual(fired, ["mouseup"]);
                done();
            }, 400);
        });

        it("does not inject a mouseup for cancels without an own gesture", function () {
            const fired: string[] = [];
            handler.addEventListener("mouseup", () => fired.push("mouseup"));

            fireTouch(el, "touchcancel", [], [{ id: 9, x: 100, y: 50 }]);

            assert.isEmpty(fired);
            assert.isFalse(handler.mouseDown[0]);
        });

        it("clearEvent detaches the touch listeners", function () {
            handler.clearEvent();

            fireTouch(el, "touchstart", [{ id: 1, x: 100, y: 50 }], [{ id: 1, x: 100, y: 50 }]);
            assert.equal(handler.lastMouseX, 0, "state must stay untouched after clearEvent");
        });

        it("sets touch-action none on the element", function () {
            assert.equal(getComputedStyle(el).touchAction, "none");
        });
    });
});
