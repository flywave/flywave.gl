import { CollisionIndex, CollisionBox } from './CollisionIndex';

export interface SymbolInstance {
    id: string;
    layerId: string;
    featureId: string | number;
    /** Anchor position in screen space */
    screenX: number;
    screenY: number;
    /** Bounding box of the icon (screen pixels) */
    iconBox?: { w: number; h: number };
    /** Bounding box of the text label (screen pixels) */
    textBox?: { w: number; h: number };
    /** Whether this symbol allows overlap */
    allowOverlap: boolean;
    /** Whether this symbol ignores placement (always shown) */
    ignorePlacement: boolean;
    /** Render priority */
    priority: number;
    /** Current opacity for fade transition */
    opacity: number;
}

export interface PlacementResult {
    visible: boolean;
    opacity: number;
}

const FADE_DURATION = 300; // ms

/**
 * Per-frame symbol placement and collision detection.
 * Evaluates which symbols are visible based on camera position,
 * symbol priority, and collision with other symbols.
 *
 * Simplified version of mapbox-gl-js Placement + CollisionIndex.
 */
export class PlacementEngine {
    private m_collisionIndex = new CollisionIndex();
    private m_opacityMap = new Map<string, { opacity: number; lastSeen: number }>();

    /**
     * Run placement for a set of symbols.
     * Collision detection runs in screen space using the CollisionIndex.
     */
    place(
        symbols: SymbolInstance[],
        now: number,
    ): Map<string, PlacementResult> {
        this.m_collisionIndex.reset();

        // Sort by priority (higher priority placed first)
        const sorted = [...symbols].sort((a, b) => b.priority - a.priority);

        const results = new Map<string, PlacementResult>();

        for (const sym of sorted) {
            const key = `${sym.layerId}:${sym.featureId}`;
            const prev = this.m_opacityMap.get(key);

            // Compute desired opacity (fade in/out)
            // For simplification: visible symbols have full opacity,
            // invisible ones have 0 opacity (instant, no fade)
            let visible = false;

            if (sym.ignorePlacement) {
                visible = true;
            } else if (sym.allowOverlap) {
                visible = true;
            } else {
                // Check collision with already-placed symbols
                const canPlace = this.canPlaceSymbol(sym);
                if (canPlace) {
                    visible = true;
                }
            }

            // Place if visible
            if (visible) {
                this.insertSymbol(sym);
            }

            // Track opacity for future fade transitions
            const opacity = visible ? 1.0 : 0.0;
            this.m_opacityMap.set(key, { opacity, lastSeen: visible ? now : (prev?.lastSeen ?? now) });

            results.set(key, { visible, opacity });
        }

        // Cleanup old entries
        for (const [key, val] of this.m_opacityMap) {
            if (now - val.lastSeen > 5000) {
                this.m_opacityMap.delete(key);
            }
        }

        return results;
    }

    private canPlaceSymbol(sym: SymbolInstance): boolean {
        const boxes = this.getSymbolBoxes(sym);
        for (const b of boxes) {
            if (!this.m_collisionIndex.canPlace(b.x, b.y, b.w, b.h, false, sym.priority)) {
                return false;
            }
        }
        return true;
    }

    private insertSymbol(sym: SymbolInstance): void {
        const boxes = this.getSymbolBoxes(sym);
        for (const b of boxes) {
            this.m_collisionIndex.insert(b);
        }
    }

    private getSymbolBoxes(sym: SymbolInstance): CollisionBox[] {
        const boxes: CollisionBox[] = [];
        if (sym.iconBox) {
            boxes.push({
                x: sym.screenX - sym.iconBox.w / 2,
                y: sym.screenY - sym.iconBox.h / 2,
                w: sym.iconBox.w,
                h: sym.iconBox.h,
                featureId: sym.featureId,
                allowOverlap: sym.allowOverlap,
                priority: sym.priority,
            });
        }
        if (sym.textBox) {
            boxes.push({
                x: sym.screenX - sym.textBox.w / 2,
                y: sym.screenY - sym.textBox.h / 2,
                w: sym.textBox.w,
                h: sym.textBox.h,
                featureId: sym.featureId,
                allowOverlap: sym.allowOverlap,
                priority: sym.priority,
            });
        }
        return boxes;
    }

    clearOpacityCache(): void {
        this.m_opacityMap.clear();
    }
}
