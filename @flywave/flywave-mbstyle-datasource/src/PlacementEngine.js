"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlacementEngine = void 0;
exports.setFadeDuration = setFadeDuration;
const CollisionIndex_1 = require("./CollisionIndex");
const FADE_DURATION = 300;
let s_fadeDuration = FADE_DURATION;
function setFadeDuration(ms) {
    s_fadeDuration = Math.max(0, ms);
}
class PlacementEngine {
    constructor() {
        this.m_collisionIndex = new CollisionIndex_1.CollisionIndex();
        this.m_opacityMap = new Map();
        this.m_lastPlacementZoom = -1;
        this.m_lastPlacementTime = 0;
    }
    place(symbols, now, zoom = 0) {
        var _a, _b, _c;
        const zoomChanged = Math.abs(zoom - this.m_lastPlacementZoom) > 0.5;
        const timeSinceLast = now - this.m_lastPlacementTime;
        const shouldReset = zoomChanged || timeSinceLast > 5000;
        if (shouldReset) {
            this.m_collisionIndex.reset();
            this.m_lastPlacementZoom = zoom;
        }
        this.m_lastPlacementTime = now;
        const sorted = [...symbols].sort((a, b) => b.priority - a.priority);
        const results = new Map();
        for (const sym of sorted) {
            const key = sym.crossTileID
                ? `cid:${sym.crossTileID}`
                : `${sym.layerId}:${sym.featureId}`;
            const prev = this.m_opacityMap.get(key);
            let visible = false;
            if (sym.ignorePlacement || sym.allowOverlap) {
                visible = true;
            }
            else if (sym.variableAnchors && sym.variableAnchors.length > 0) {
                for (const anchor of sym.variableAnchors) {
                    const offset = this.getAnchorBoxOffset(anchor, sym, (_a = sym.textRadialOffset) !== null && _a !== void 0 ? _a : 0);
                    if (this.canPlaceSymbol(sym, offset.dx, offset.dy)) {
                        visible = true;
                        if (sym.object) {
                            sym.object.position.x += offset.dx;
                            sym.object.position.y += offset.dy;
                        }
                        break;
                    }
                }
            }
            else {
                if (this.canPlaceSymbol(sym)) {
                    visible = true;
                }
            }
            if (!visible && sym.iconOptional && sym.textBox) {
                const iconBoxBackup = sym.iconBox;
                sym.iconBox = undefined;
                if (this.canPlaceSymbol(sym)) {
                    visible = true;
                }
                sym.iconBox = iconBoxBackup;
            }
            if (visible) {
                this.insertSymbol(sym);
            }
            const targetOpacity = visible ? 1.0 : 0.0;
            const prevOpacity = (_b = prev === null || prev === void 0 ? void 0 : prev.opacity) !== null && _b !== void 0 ? _b : 0.0;
            const prevTarget = (_c = prev === null || prev === void 0 ? void 0 : prev.targetOpacity) !== null && _c !== void 0 ? _c : 0.0;
            let opacity;
            if (targetOpacity !== prevTarget) {
                opacity = prevOpacity;
                this.m_opacityMap.set(key, {
                    opacity: prevOpacity,
                    lastSeen: now,
                    targetOpacity,
                    fadeStart: now,
                });
                const elapsed = 0;
                const t = Math.min(1, elapsed / s_fadeDuration);
                opacity = prevOpacity + (targetOpacity - prevOpacity) * t;
            }
            else if (prev && prev.targetOpacity !== prevOpacity) {
                const elapsed = now - prev.fadeStart;
                const t = Math.min(1, elapsed / s_fadeDuration);
                opacity = prevOpacity + (targetOpacity - prevOpacity) * t;
                this.m_opacityMap.set(key, {
                    opacity,
                    lastSeen: now,
                    targetOpacity,
                    fadeStart: prev.fadeStart,
                });
            }
            else {
                opacity = targetOpacity;
                this.m_opacityMap.set(key, {
                    opacity,
                    lastSeen: now,
                    targetOpacity,
                    fadeStart: now,
                });
            }
            results.set(key, { visible, opacity });
        }
        for (const [key, val] of this.m_opacityMap) {
            if (now - val.lastSeen > 5000) {
                this.m_opacityMap.delete(key);
            }
        }
        return results;
    }
    stillRecent(now) {
        return now - this.m_lastPlacementTime < s_fadeDuration;
    }
    canPlaceSymbol(sym, dx = 0, dy = 0) {
        const boxes = this.getSymbolBoxes(sym, dx, dy);
        for (const b of boxes) {
            if (!this.m_collisionIndex.canPlace(b.x, b.y, b.w, b.h, false, sym.priority)) {
                return false;
            }
        }
        return true;
    }
    insertSymbol(sym) {
        const boxes = this.getSymbolBoxes(sym);
        for (const b of boxes) {
            this.m_collisionIndex.insert(b);
        }
    }
    getSymbolBoxes(sym, dx = 0, dy = 0) {
        const boxes = [];
        if (sym.iconBox) {
            boxes.push({
                x: sym.screenX - sym.iconBox.w / 2 + dx,
                y: sym.screenY - sym.iconBox.h / 2 + dy,
                w: sym.iconBox.w,
                h: sym.iconBox.h,
                featureId: sym.featureId,
                allowOverlap: sym.allowOverlap,
                priority: sym.priority,
            });
        }
        if (sym.textBox) {
            boxes.push({
                x: sym.screenX - sym.textBox.w / 2 + dx,
                y: sym.screenY - sym.textBox.h / 2 + dy,
                w: sym.textBox.w,
                h: sym.textBox.h,
                featureId: sym.featureId,
                allowOverlap: sym.allowOverlap,
                priority: sym.priority,
            });
        }
        return boxes;
    }
    getAnchorBoxOffset(anchor, sym, radialOffset) {
        var _a, _b, _c, _d, _e;
        const tw = (_b = (_a = sym.textBox) === null || _a === void 0 ? void 0 : _a.w) !== null && _b !== void 0 ? _b : 0;
        const th = (_d = (_c = sym.textBox) === null || _c === void 0 ? void 0 : _c.h) !== null && _d !== void 0 ? _d : 0;
        const halfW = tw / 2 + radialOffset;
        const halfH = th / 2 + radialOffset;
        const offsets = {
            'center': [0, 0],
            'left': [-halfW, 0],
            'right': [halfW, 0],
            'top': [0, -halfH],
            'bottom': [0, halfH],
            'top-left': [-halfW, -halfH],
            'top-right': [halfW, -halfH],
            'bottom-left': [-halfW, halfH],
            'bottom-right': [halfW, halfH],
        };
        const [dx, dy] = (_e = offsets[anchor]) !== null && _e !== void 0 ? _e : [0, 0];
        return { dx, dy };
    }
    clearOpacityCache() {
        this.m_opacityMap.clear();
    }
}
exports.PlacementEngine = PlacementEngine;
//# sourceMappingURL=PlacementEngine.js.map