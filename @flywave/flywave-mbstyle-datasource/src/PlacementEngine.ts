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
    /** Stable cross-tile identity (assigned by CrossTileSymbolIndex). */
    crossTileID?: number;
    /** Label content (text or icon name) for cross-tile matching. */
    text?: string;
    /** Source tile key for cross-tile matching/pruning. */
    tileKey?: string;
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
    private m_opacityMap = new Map<string, {
        opacity: number;
        lastSeen: number;
        targetOpacity: number;
        fadeStart: number;
    }>();
    private m_lastPlacementZoom = -1;
    private m_lastPlacementTime = 0;

    /**
     * Run placement for a set of symbols.
     * Collision detection runs in screen space using the CollisionIndex.
     *
     * Cross-tile consistency: the CollisionIndex is NOT reset every frame.
     * Instead, it persists between frames and only resets when the zoom level
     * changes (indicating new tiles have loaded). This prevents symbol flickering.
     */
    place(
        symbols: SymbolInstance[],
        now: number,
        zoom: number = 0,
    ): Map<string, PlacementResult> {
        const zoomChanged = Math.abs(zoom - this.m_lastPlacementZoom) > 0.5;
        const timeSinceLast = now - this.m_lastPlacementTime;
        const shouldReset = zoomChanged || timeSinceLast > 5000;

        if (shouldReset) {
            this.m_collisionIndex.reset();
            this.m_lastPlacementZoom = zoom;
        }
        this.m_lastPlacementTime = now;

        const sorted = [...symbols].sort((a, b) => b.priority - a.priority);

        const results = new Map<string, PlacementResult>();

        for (const sym of sorted) {
            // Key the opacity map by crossTileID when available: this gives the
            // same label a stable identity across frames/tiles, so fade opacity
            // persists correctly. Fall back to the volatile layerId:featureId.
            const key = sym.crossTileID
                ? `cid:${sym.crossTileID}`
                : `${sym.layerId}:${sym.featureId}`;
            const prev = this.m_opacityMap.get(key);

            let visible = false;

            if (sym.ignorePlacement || sym.allowOverlap) {
                visible = true;
            } else if (sym.variableAnchors && sym.variableAnchors.length > 0) {
                for (const anchor of sym.variableAnchors) {
                    const offset = this.getAnchorBoxOffset(anchor, sym, sym.textRadialOffset ?? 0);
                    if (this.canPlaceSymbol(sym, offset.dx, offset.dy)) {
                        visible = true;
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

            if (visible) {
                this.insertSymbol(sym);
            }

            const targetOpacity = visible ? 1.0 : 0.0;
            const prevOpacity = prev?.opacity ?? 0.0;
            const prevTarget = prev?.targetOpacity ?? 0.0;

            let opacity: number;
            if (targetOpacity !== prevTarget) {
                opacity = prevOpacity;
                this.m_opacityMap.set(key, {
                    opacity: prevOpacity,
                    lastSeen: now,
                    targetOpacity,
                    fadeStart: now,
                });
                const elapsed = 0;
                const t = Math.min(1, elapsed / FADE_DURATION);
                opacity = prevOpacity + (targetOpacity - prevOpacity) * t;
            } else if (prev && prev.targetOpacity !== prevOpacity) {
                const elapsed = now - prev.fadeStart;
                const t = Math.min(1, elapsed / FADE_DURATION);
                opacity = prevOpacity + (targetOpacity - prevOpacity) * t;
                this.m_opacityMap.set(key, {
                    opacity,
                    lastSeen: now,
                    targetOpacity,
                    fadeStart: prev.fadeStart,
                });
            } else {
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

    /**
     * Whether the last placement is still "recent" enough that callers can skip
     * a new placement and reuse results (letting in-flight fades continue).
     * Reference: mapbox stillRecent(now, zoom) ≈ commitTime + fadeDuration > now.
     */
    stillRecent(now: number): boolean {
        return now - this.m_lastPlacementTime < FADE_DURATION;
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
