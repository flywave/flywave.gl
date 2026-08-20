"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollisionIndex = void 0;
const CELL_SIZE = 64;
class CollisionIndex {
    constructor() {
        this.m_grid = new Map();
        this.m_allBoxes = [];
    }
    reset() {
        this.m_grid.clear();
        this.m_allBoxes = [];
    }
    insert(box) {
        this.m_allBoxes.push(box);
        const cells = this.getCells(box.x, box.y, box.w, box.h);
        for (const key of cells) {
            let cell = this.m_grid.get(key);
            if (!cell) {
                cell = { boxes: [] };
                this.m_grid.set(key, cell);
            }
            cell.boxes.push(box);
        }
    }
    canPlace(x, y, w, h, allowOverlap, priority) {
        if (allowOverlap)
            return true;
        const cells = this.getCells(x, y, w, h);
        for (const key of cells) {
            const cell = this.m_grid.get(key);
            if (!cell)
                continue;
            for (const other of cell.boxes) {
                if (other.allowOverlap)
                    continue;
                if (this.intersects(x, y, w, h, other.x, other.y, other.w, other.h)) {
                    if (priority <= other.priority)
                        return false;
                }
            }
        }
        return true;
    }
    intersects(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }
    getCells(x, y, w, h) {
        const cells = [];
        const x0 = Math.floor(x / CELL_SIZE);
        const y0 = Math.floor(y / CELL_SIZE);
        const x1 = Math.floor((x + w) / CELL_SIZE);
        const y1 = Math.floor((y + h) / CELL_SIZE);
        for (let cx = x0; cx <= x1; cx++) {
            for (let cy = y0; cy <= y1; cy++) {
                cells.push(`${cx}:${cy}`);
            }
        }
        return cells;
    }
    get placedCount() {
        return this.m_allBoxes.length;
    }
}
exports.CollisionIndex = CollisionIndex;
//# sourceMappingURL=CollisionIndex.js.map