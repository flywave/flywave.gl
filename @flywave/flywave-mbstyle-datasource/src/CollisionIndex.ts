export interface CollisionBox {
    x: number;
    y: number;
    w: number;
    h: number;
    featureId: string | number;
    allowOverlap: boolean;
    priority: number;
}

interface GridCell {
    boxes: CollisionBox[];
}

const CELL_SIZE = 64;

/**
 * Screen-space spatial grid for collision detection among symbol placements.
 * Used per-frame to test whether a new symbol overlaps any already-placed symbol.
 *
 * Reference: mapbox-gl-js CollisionIndex + GridIndex
 */
export class CollisionIndex {
    private m_grid: Map<string, GridCell> = new Map();
    private m_allBoxes: CollisionBox[] = [];

    reset(): void {
        this.m_grid.clear();
        this.m_allBoxes = [];
    }

    insert(box: CollisionBox): void {
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

    /**
     * Test if a box can be placed. Returns true if no collision.
     */
    canPlace(
        x: number, y: number, w: number, h: number,
        allowOverlap: boolean,
        priority: number,
    ): boolean {
        if (allowOverlap) return true;

        const cells = this.getCells(x, y, w, h);
        for (const key of cells) {
            const cell = this.m_grid.get(key);
            if (!cell) continue;
            for (const other of cell.boxes) {
                if (other.allowOverlap) continue;
                if (this.intersects(x, y, w, h, other.x, other.y, other.w, other.h)) {
                    // mgl placeCollisionBox: ANY intersection with an
                    // already-placed box rejects — placement order (sorted
                    // before insertion) decides the winner, priority is not
                    // consulted here.
                    return false;
                }
            }
        }
        return true;
    }

    private intersects(
        ax: number, ay: number, aw: number, ah: number,
        bx: number, by: number, bw: number, bh: number,
    ): boolean {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    private getCells(x: number, y: number, w: number, h: number): string[] {
        const cells: string[] = [];
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

    get placedCount(): number {
        return this.m_allBoxes.length;
    }
}
