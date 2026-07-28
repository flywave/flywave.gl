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
    /** Optional reference to the Three.js object for visibility control */
    object?: any;
    /** Variable anchors to try (e.g., ['center','top','bottom']) */
    variableAnchors?: string[];
    /** Offset applied per anchor */
    textRadialOffset?: number;
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
            let visible = false;
            let placedAnchor: string | undefined;

            if (sym.ignorePlacement || sym.allowOverlap) {
                visible = true;
            } else if (sym.variableAnchors && sym.variableAnchors.length > 0) {
                // Try each variable anchor position
                for (const anchor of sym.variableAnchors) {
                    const offset = this.getAnchorBoxOffset(anchor, sym, sym.textRadialOffset ?? 0);
                    if (this.canPlaceSymbol(sym, offset.dx, offset.dy)) {
                        visible = true;
                        placedAnchor = anchor;
                        // Update symbol position to the successful anchor
                        if (sym.object) {
                            sym.object.position.x += offset.dx;
                            sym.object.position.y += offset.dy;
                        }
                        break;
                    }
                }
            } else {
                if (this.canPlaceSymbol(sym)) {
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

    private canPlaceSymbol(sym: SymbolInstance, dx: number = 0, dy: number = 0): boolean {
        const boxes = this.getSymbolBoxes(sym, dx, dy);
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

    private getSymbolBoxes(sym: SymbolInstance, dx: number = 0, dy: number = 0): CollisionBox[] {
        const boxes: CollisionBox[] = [];
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

    /**
     * Compute offset for a variable anchor position.
     */
    private getAnchorBoxOffset(
        anchor: string,
        sym: SymbolInstance,
        radialOffset: number,
    ): { dx: number; dy: number } {
        const tw = sym.textBox?.w ?? 0;
        const th = sym.textBox?.h ?? 0;
        const halfW = tw / 2 + radialOffset;
        const halfH = th / 2 + radialOffset;

        const offsets: Record<string, [number, number]> = {
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

        const [dx, dy] = offsets[anchor] ?? [0, 0];
        return { dx, dy };
    }

    clearOpacityCache(): void {
        this.m_opacityMap.clear();
    }
}
