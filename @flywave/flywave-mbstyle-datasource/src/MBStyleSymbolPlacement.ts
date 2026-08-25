import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { PlacementEngine, SymbolInstance } from './PlacementEngine';
import { MBStyleDataSource } from './MBStyleDataSource';
import { getLineAnchors } from './LineAnchor';
import { CrossTileSymbolIndex } from './CrossTileSymbolIndex';
import { CollisionIndex } from './CollisionIndex';
import { shapeText } from './TextShaping';

/**
 * Per-frame symbol placement controller for MBStyleDataSource.
 *
 * Collects all symbol objects (icons + text) from decoded tiles,
 * projects their world positions to screen space,
 * runs collision detection via PlacementEngine,
 * and sets object.visible accordingly.
 *
 * Usage:
 *   const placement = new MBStyleSymbolPlacement(mapView, dataSource);
 *   mapView.addEventListener('AfterRender', () => placement.run());
 */
export class MBStyleSymbolPlacement {
    private m_placementEngine = new PlacementEngine();
    private m_crossTileIndex = new CrossTileSymbolIndex();
    private m_lastZoom = -1;
    /** True while any placed symbol's fade has not reached 1 yet. */
    private m_anyFading = false;
    private m_collisionDebug = false;
    /** mgl-parity collision overlay state (collisionDebug fixtures only). */
    private m_collisionOverlay: {
        scene: THREE.Scene;
        camera: THREE.OrthographicCamera;
        placedSeg: THREE.LineSegments;
        hiddenSeg: THREE.LineSegments;
    } | null = null;
    /** Shaped-box cache: key → {w,h} in px. */
    private m_shapedBoxCache = new Map<string, { w: number; h: number }>();
    private m_glyphLookup: { getMetrics: (font: string, char: string) => any } | undefined;

    constructor(
        private m_mapView: MapView,
        private m_dataSource: MBStyleDataSource,
    ) {}

    /** Enable collision-box debug visualization (metadata.test.collisionDebug). */
    setCollisionDebug(enabled: boolean): void {
        this.m_collisionDebug = enabled;
    }

    /**
     * Run symbol placement for the current frame.
     * Call this once per frame (e.g., in AfterRender event).
     */
    run(): void {
        const zoom = this.m_mapView.zoomLevel;
        const camera = this.m_mapView.camera;
        const canvas = this.m_mapView.canvas;
        const w = canvas.width;
        const h = canvas.height;
        const bearing = (this.m_mapView as any).heading ?? 0;

        // Collect all symbol objects
        const symbols = this.collectSymbols(camera, w, h);
        if (symbols.length === 0) return;

        // mgl fog symbol clipping (collision_index.ts:547): symbols whose fog
        // opacity exceeds FOG_SYMBOL_CLIPPING_THRESHOLD (0.9) are not placed
        // at all — the CPU-side opacity (fog_helpers.getFogOpacity) is
        // min(1, 1.00747·falloff³) · smoothstep(60°,65°,pitch) · color.a over
        // the fov-shifted range; our scene.fog near/far already carry the
        // calibrated metric conversion, and fogAlpha the pitch·color alpha.
        try {
            const scene = (this.m_mapView as any).m_scene;
            const fog = scene?.fog as { near: number; far: number } | null | undefined;
            const fogAlpha = (THREE.UniformsLib.fog as any).fogAlpha?.value;
            if (fog && typeof fogAlpha === 'number' && fogAlpha > 0 && fog.far > fog.near) {
                const camPos = camera.position;
                const fwd = camera.getWorldDirection(new THREE.Vector3());
                const tmp = new THREE.Vector3();
                for (const sym of symbols) {
                    if (!sym.object) continue;
                    sym.object.getWorldPosition(tmp);
                    const depth = -tmp.sub(camPos).dot(fwd);
                    const t = (depth - fog.near) / (fog.far - fog.near);
                    if (t <= 0) continue;
                    const falloff = 1 - Math.min(1, Math.exp(-6 * t));
                    const opacity = Math.min(1, 1.00747 * falloff * falloff * falloff) * fogAlpha;
                    if (opacity > 0.9) {
                        sym.opacity = 0;
                        sym.object.visible = false;
                    }
                }
            }
        } catch {}

        // Assign stable cross-tile IDs so fade opacity persists across frames/tiles.
        this.assignCrossTileIDs(symbols, zoom);

        // Apply symbol-z-order: sort by viewport-y or source order
        this.applyZOrder(symbols);

        // Apply icon-translate / text-offset / text-translate (screen-space offset
        // converted back to world via the camera, honoring translate-anchor).
        this.applyOffsets(symbols, bearing, camera, w, h);

        // Apply icon-rotation-alignment
        this.applyRotationAlignment(symbols, bearing);

        // Re-run placement when the zoom changed OR a fade is still in
        // flight — the fade advances by wall clock, so without the second
        // condition a label captured mid-fade stays at its initial low
        // opacity forever (regressions/mapbox-gl-js#3365: bearing-only
        // camera moves never re-placed).
        let needsPlace = zoom !== this.m_lastZoom || this.m_anyFading;
        if (needsPlace) {
            this.m_lastZoom = zoom;
            this.m_anyFading = false;
            const results = this.m_placementEngine.place(symbols, Date.now(), zoom);

            for (const sym of symbols) {
                const key = sym.crossTileID
                    ? `cid:${sym.crossTileID}`
                    : `${sym.layerId}:${sym.featureId}`;
                const result = results.get(key);
                if (result && sym.object) {
                    sym.object.visible = result.opacity > 0.01;
                    // Assign opacity EVERY re-place: the fade-in path leaves
                    // a low value on the material and completion (>=1) must
                    // restore it, not skip it.
                    if (result.opacity < 1) {
                        this.m_anyFading = true;
                        sym.object.traverse((child: THREE.Object3D) => {
                            if ((child as THREE.Mesh).material) {
                                const mat = (child as THREE.Mesh).material as THREE.Material | THREE.Material[];
                                if (Array.isArray(mat)) {
                                    for (const m of mat) {
                                        (m as any).opacity = result.opacity;
                                        m.transparent = true;
                                    }
                                } else {
                                    (mat as any).opacity = result.opacity;
                                    (mat as any).transparent = true;
                                }
                            }
                        });
                    } else {
                        // Fade complete: restore full opacity on materials the
                        // fade-in path left at a low value.
                        sym.object.traverse((child: THREE.Object3D) => {
                            if ((child as THREE.Mesh).material) {
                                const mat = (child as THREE.Mesh).material as THREE.Material | THREE.Material[];
                                if (Array.isArray(mat)) {
                                    for (const m of mat) (m as any).opacity = 1;
                                } else {
                                    (mat as any).opacity = 1;
                                }
                            }
                        });
                    }
                }
            }
        }

        // Collision-box debug overlay: mgl-parity placement decisions on the
        // engine text elements (see applyMglCollisionVisibility) + box lines.
        if (this.m_collisionDebug) {
            try {
                this.applyMglCollisionVisibility(camera, w, h);
            } catch {
                // best-effort debug overlay
            }
        }
    }

    /**
     * mgl-parity symbol collision for `collisionDebug` fixtures.
     *
     * The engine's TextElementsRenderer placement accepts many symbols mgl
     * hides (measured: mgl keeps almost nothing placed on dense fixtures —
     * §171), and that placement-set difference dominates the family's
     * mismatch. Here we re-decide visibility with our own screen-space
     * CollisionIndex using mgl semantics (priority order, text/icon boxes
     * tested independently) and force `TextElement.visible` accordingly —
     * hiding the extra labels — while drawing the boxes with the same
     * verdicts.
     */
    private applyMglCollisionVisibility(
        camera: THREE.Camera,
        canvasW: number,
        canvasH: number,
    ): void {
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        if (!renderer) return;

        if (!this.m_glyphLookup) {
            try {
                const metrics: Map<string, any> | undefined =
                    (this.m_dataSource as any).m_glyphMetrics;
                if (metrics && metrics.size > 0) {
                    // Same key format/fallbacks as MBStyleDecoder.buildGlyphLookup.
                    this.m_glyphLookup = {
                        getMetrics(font: string, char: string) {
                            const direct = metrics.get(`${font}:${char}`);
                            if (direct) return direct;
                            if (font && font.includes(',')) {
                                for (const f of font.split(',').map(s => s.trim())) {
                                    const m = metrics.get(`${f}:${char}`);
                                    if (m) return m;
                                }
                            }
                            if (font) {
                                const base = font.split(' ').slice(0, -1).join(' ');
                                if (base) {
                                    const m = metrics.get(`${base}:${char}`);
                                    if (m) return m;
                                }
                            }
                            return undefined;
                        },
                    };
                }
            } catch {}
        }
        const metrics: Map<string, any> | undefined = (this.m_dataSource as any).m_glyphMetrics;
        const fallbackFont = (() => {
            const first = metrics?.keys?.().next()?.value as string | undefined;
            return first ? first.slice(0, first.lastIndexOf(':')) : '';
        })();
        const shapeBox = (text: string, fontSize: number, lp: any, fontName: string): { w: number; h: number } => {
            const key = `${fontSize}|${lp?.lineWidth ?? 0}|${lp?.leading ?? 0}|${text}`;
            let box = this.m_shapedBoxCache.get(key);
            if (!box) {
                const shaped = shapeText(text, {
                    fontSize,
                    maxWidth: lp?.lineWidth ? lp.lineWidth / fontSize : 10,
                    lineHeight: 1 + (lp?.leading ?? 0) / 24,
                    letterSpacing: (lp?.tracking ?? 0) / 24,
                    justify: 'center',
                    anchor: 'center',
                    transform: 'none',
                    writingMode: undefined,
                    glyphLookup: this.m_glyphLookup as any,
                    fontName: fontName || fallbackFont,
                });
                // shapeText measures in EM units — scale to pixels.
                box = {
                    w: (shaped.right - shaped.left) * fontSize,
                    h: (shaped.bottom - shaped.top) * fontSize,
                };
                this.m_shapedBoxCache.set(key, box);
            }
            return box;
        };

        // Gather per-element screen data (dedupe across tile levels by
        // featureId+text — mgl keeps one placement per feature).
        interface Entry {
            el: any;
            sx: number; sy: number;
            priority: number;
            allowOverlap: boolean;
            iconRect: [number, number, number, number] | null; // cx, cy, w, h
            textRect: [number, number, number, number] | null;
        }
        const entries: Entry[] = [];
        const seen = new Set<string>();
        const v = new THREE.Vector3();
        for (const tile of this.m_dataSource.getDecodedTiles()) {
            const groups = (tile as any).textElementGroups?.groups as
                Map<number, { elements: any[] }> | undefined;
            if (!groups) continue;
            for (const group of groups.values()) {
                for (const el of group.elements) {
                    if (!el || !el.position) continue;
                    v.copy(el.position).project(camera);
                    const sx = (v.x * 0.5 + 0.5) * canvasW;
                    const sy = (-v.y * 0.5 + 0.5) * canvasH;
                    if (sx < -60 || sx > canvasW + 60 || sy < -60 || sy > canvasH + 60) continue;
                    const key = `${el.featureId ?? ''}:${el.text}`;
                    if (seen.has(key)) continue;
                    seen.add(key);

                    // mgl anchors align the box EDGE to the anchor point plus
                    // text-offset (engine enums: Horizontal Left=0/Center=-0.5/
                    // Right=-1 left-edge fraction; Vertical Above=0/Center=-0.5/
                    // Below=-1, mgl 'top'→Below; native offsets are px, y UP).
                    const lp = el.layoutParams?.m_params ?? {};
                    const hA = Number(lp.horizontalAlignment ?? -0.5);
                    const vA = Number(lp.verticalAlignment ?? -0.5);
                    const dx = Number(el.xOffset ?? 0);
                    const dy = -Number(el.yOffset ?? 0);
                    const textRectOf = (w: number, h: number): [number, number, number, number] => {
                        const left = sx + dx + hA * w;
                        let top: number;
                        if (vA === -1) top = sy + dy;
                        else if (vA === 0) top = sy + dy - h;
                        else top = sy + dy - h / 2;
                        return [left + w / 2, top + h / 2, w, h];
                    };

                    let iconRect: [number, number, number, number] | null = null;
                    let textRect: [number, number, number, number] | null = null;
                    const poiInfo = el.poiInfo;
                    const fontSize = Number(el.renderParams?.fontSize?.size ?? 16);
                    if (poiInfo) {
                        const tech: any = poiInfo.technique ?? {};
                        const iconScale = Number(tech._layout?.['icon-size'] ?? tech.iconScale ?? 1);
                        if (poiInfo.iconTextFit && el.text) {
                            const box = shapeBox(String(el.text), fontSize, el.layoutParams, el.renderParams?.fontName);
                            const p = poiInfo.iconTextFitPadding ?? [0, 0, 0, 0];
                            iconRect = textRectOf(box.w + p[1] + p[3] + 4, box.h + p[0] + p[2] + 4);
                        } else {
                            iconRect = [sx + dx, sy + dy, 32 * iconScale, 32 * iconScale];
                        }
                    }
                    if (el.text) {
                        const box = shapeBox(String(el.text), fontSize, el.layoutParams, el.renderParams?.fontName);
                        textRect = textRectOf(box.w + 4, box.h + 4);
                    }
                    entries.push({
                        el,
                        sx, sy,
                        priority: Number(el.priority ?? 0),
                        allowOverlap: el.textMayOverlap === true,
                        iconRect,
                        textRect,
                    });
                }
            }
        }

        // mgl placement order: higher priority first; later colliders lose.
        entries.sort((a, b) => b.priority - a.priority);
        const index = new CollisionIndex();
        const placedBoxes: number[] = [];
        const hiddenBoxes: number[] = [];
        const pushRect = (r: [number, number, number, number], out: number[]) => {
            const [cx, cy, w, h] = r;
            const hw = w / 2, hh = h / 2;
            const corners = [
                [cx - hw, cy - hh], [cx + hw, cy - hh],
                [cx + hw, cy - hh], [cx + hw, cy + hh],
                [cx + hw, cy + hh], [cx - hw, cy + hh],
                [cx - hw, cy + hh], [cx - hw, cy - hh],
            ];
            for (const [px, py] of corners) out.push(px, -py, 0);
        };
        for (const e of entries) {
            let anyPlaced = false;
            for (const rect of [e.iconRect, e.textRect]) {
                if (!rect) continue;
                // CollisionIndex x/y are the TOP-LEFT corner.
                const lx = rect[0] - rect[2] / 2;
                const ly = rect[1] - rect[3] / 2;
                const fits = index.canPlace(lx, ly, rect[2], rect[3],
                    e.allowOverlap, e.priority);
                if (fits) {
                    index.insert({
                        x: lx, y: ly, w: rect[2], h: rect[3],
                        featureId: String(e.el.featureId ?? e.el.text ?? ''),
                        allowOverlap: e.allowOverlap,
                        priority: e.priority,
                    });
                    pushRect(rect, placedBoxes);
                    anyPlaced = true;
                } else {
                    pushRect(rect, hiddenBoxes);
                }
            }
            // Force engine visibility to the mgl verdict: hide the labels
            // mgl would have suppressed (the engine accepts more than mgl).
            try {
                e.el.visible = e.iconRect || e.textRect ? anyPlaced : true;
            } catch {}
        }

        this.drawCollisionBoxes(renderer, placedBoxes, hiddenBoxes, canvasW, canvasH);
    }

    /**
     * Draw the collision boxes (mgl collision_box.fragment colors: placed =
     * blue (0,0,1) alpha 0.25, hidden = red (1,0,0) alpha 0.5) through a
     * private screen-space scene composited directly onto the canvas — the
     * MBHeatmapRenderer pattern (objects added to the engine scene after its
     * render-list snapshot never rasterize, §110).
     */
    private drawCollisionBoxes(
        renderer: THREE.WebGLRenderer,
        placedBoxes: number[],
        hiddenBoxes: number[],
        canvasW: number,
        canvasH: number,
    ): void {
        if (!this.m_collisionOverlay) {
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
            const group = new THREE.Group();
            group.frustumCulled = false;
            const segs: THREE.LineSegments[] = [];
            for (const [color, opacity] of [[0x0000ff, 0.25], [0xff0000, 0.5]] as const) {
                const geom = new THREE.BufferGeometry();
                const mat = new THREE.LineBasicMaterial({
                    color,
                    transparent: true,
                    opacity,
                    depthTest: false,
                    depthWrite: false,
                });
                const seg = new THREE.LineSegments(geom, mat);
                seg.frustumCulled = false;
                group.add(seg);
                segs.push(seg);
            }
            scene.add(group);
            this.m_collisionOverlay = { scene, camera, placedSeg: segs[0], hiddenSeg: segs[1] };
        }
        const ov = this.m_collisionOverlay;
        for (const [seg, pos] of [[ov.placedSeg, placedBoxes], [ov.hiddenSeg, hiddenBoxes]] as const) {
            seg.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            seg.geometry.attributes.position.needsUpdate = true;
            seg.visible = pos.length > 0;
        }
        // Pixel-space ortho: (0,0) top-left → (w,h) bottom-right (y ∈ [-h,0]).
        ov.camera.right = canvasW;
        ov.camera.bottom = -canvasH;
        ov.camera.updateProjectionMatrix();
        const prevAutoClear = renderer.autoClear;
        const prevRT = renderer.getRenderTarget();
        try {
            renderer.autoClear = false;
            renderer.setRenderTarget(null);
            renderer.render(ov.scene, ov.camera);
        } finally {
            renderer.setRenderTarget(prevRT);
            renderer.autoClear = prevAutoClear;
        }
    }

    private applyRotationAlignment(symbols: SymbolInstance[], bearing: number): void {
        for (const sym of symbols) {
            if (!sym.object) continue;

            const obj = sym.object as THREE.Object3D;
            const tech = obj.userData?.technique;
            if (!tech) continue;

            const layout = tech._layout ?? {};
            const isText = tech.name === 'text';
            const isIcon = tech.name === 'labeled-icon';

            // icon-rotation-alignment
            if (isIcon) {
                const alignment = layout['icon-rotation-alignment'] ?? 'auto';
                const placement = layout['symbol-placement'] ?? 'point';
                const isMapAligned = alignment === 'map' || (alignment === 'auto' && placement === 'line');
                if (isMapAligned && (obj as any).isSprite) {
                    const bearingRad = -bearing * Math.PI / 180;
                    const mat = (obj as any).material;
                    if (mat) {
                        mat.rotation = (tech._paint?.['icon-rotate'] ?? 0) * Math.PI / 180 + bearingRad;
                    }
                }
            }

            // text-rotation-alignment
            if (isText) {
                const alignment = layout['text-rotation-alignment'] ?? 'auto';
                const placement = layout['symbol-placement'] ?? 'point';
                const isMapAligned = alignment === 'map' || (alignment === 'auto' && placement === 'line');
                if (isMapAligned) {
                    // For text meshes, apply rotation
                    const bearingRad = -bearing * Math.PI / 180;
                    const textRotate = (layout['text-rotate'] ?? 0) * Math.PI / 180;
                    obj.rotation.z = textRotate + bearingRad;
                } else {
                    // Viewport aligned: only apply text-rotate
                    const textRotate = (layout['text-rotate'] ?? 0) * Math.PI / 180;
                    obj.rotation.z = textRotate;
                }
            }

            // text-keep-upright: flip text if upside down
            if (isText && layout['text-keep-upright'] !== false) {
                const placement = layout['symbol-placement'] ?? 'point';
                if (placement === 'line') {
                    const currentRot = obj.rotation.z;
                    const normalized = ((currentRot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                    if (normalized > Math.PI / 2 && normalized < 3 * Math.PI / 2) {
                        obj.rotation.z += Math.PI;
                    }
                }
            }

            // icon-keep-upright: flip icon if upside down
            if (isIcon && layout['icon-keep-upright'] === true) {
                const placement = layout['symbol-placement'] ?? 'point';
                if (placement === 'line' && (obj as any).isSprite) {
                    const mat = (obj as any).material;
                    if (mat) {
                        const normalized = ((mat.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                        if (normalized > Math.PI / 2 && normalized < 3 * Math.PI / 2) {
                            mat.rotation += Math.PI;
                        }
                    }
                }
            }

            // text-pitch-alignment: 'map' pitches with terrain, 'viewport' stays flat
            // For Three.js, viewport = billboarded (default for sprites),
            // map = needs to rotate with map pitch
            const pitchAlign = isText
                ? (layout['text-pitch-alignment'] ?? 'auto')
                : (layout['icon-pitch-alignment'] ?? 'auto');
            if (pitchAlign === 'map') {
                const tilt = (this.m_mapView as any).tilt ?? 0;
                obj.rotation.x = -tilt * Math.PI / 180;
            }
        }
    }

    private collectSymbols(camera: THREE.Camera, canvasW: number, canvasH: number): SymbolInstance[] {
        const symbols: SymbolInstance[] = [];
        const worldPosition = new THREE.Vector3();

        // Iterate all tiles from the datasource (stored in mapview's
        // VisibleTileSet cache; see MBStyleDataSource.getDecodedTiles).
        const tiles = this.m_dataSource.getDecodedTiles();
        if (tiles.length === 0) return symbols;

        for (const tile of tiles) {
                if (!tile.objects) continue;

                for (const obj of tile.objects) {
                    if (!obj.userData?.technique) continue;
                    const tech = obj.userData.technique;

                    if (tech.name !== 'text' && tech.name !== 'labeled-icon') continue;

                    obj.getWorldPosition(worldPosition);

                    const layout = tech._layout ?? {};
                    const placement = layout['symbol-placement'] ?? 'point';
                    const linePathData = obj.userData?.feature?.objInfos?.[0]?._linePath;

                    if ((placement === 'line' || placement === 'line-center') && linePathData && linePathData.length >= 2) {
                        const screenPts: THREE.Vector2[] = linePathData.map((pt: number[]) => {
                            const wp = new THREE.Vector3(pt[0], pt[1], 0);
                            obj.parent?.localToWorld(wp);
                            const sp = wp.clone().project(camera);
                            return new THREE.Vector2(
                                (sp.x * 0.5 + 0.5) * canvasW,
                                (-sp.y * 0.5 + 0.5) * canvasH,
                            );
                        });
                        const spacing = (layout['symbol-spacing'] as number) ?? 250;
                        const maxAngle = ((layout['text-max-angle'] as number) ?? 45) * Math.PI / 180;
                        const anchors = getLineAnchors(screenPts, spacing, maxAngle);

                        for (const anchor of anchors) {
                            const feature = obj.userData.feature;
                            const featureId = feature?.objInfos?.[0]?.$id ?? obj.id ?? '';
                            const textSize = layout['text-size'] ?? 16;
                            const iconSize = layout['icon-size'] ?? 1;
                            let iconBox: { w: number; h: number } | undefined;
                            let textBox: { w: number; h: number } | undefined;
                            if (tech.name === 'labeled-icon') iconBox = { w: 32 * iconSize, h: 32 * iconSize };
                            if (tech.name === 'text' || layout['text-field']) {
                                textBox = {
                                    w: (tech._textWidth ?? textSize * 5) * textSize,
                                    h: (tech._textHeight ?? textSize * 1.2) * textSize,
                                };
                            }
                            symbols.push({
                                id: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}:${featureId}:${anchor.segmentIndex}`,
                                layerId: tech._layerId ?? '',
                                featureId,
                                screenX: anchor.x,
                                screenY: anchor.y,
                                iconBox,
                                textBox,
                                allowOverlap: layout['icon-allow-overlap'] === true || layout['text-allow-overlap'] === true,
                                ignorePlacement: layout['icon-ignore-placement'] === true || layout['text-ignore-placement'] === true,
                                priority: typeof layout['symbol-sort-key'] === 'number'
                            ? -(layout['symbol-sort-key'] as number)
                            : (tech._renderOrder ?? 0),
                                opacity: 1,
                                object: obj,
                                variableAnchors: layout['text-variable-anchor'] as string[] | undefined,
                                textRadialOffset: layout['text-radial-offset'] as number ?? 0,
                                text: tech.text ?? tech.imageTexture ?? '',
                                tileKey: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}`,
                            });
                        }
                        continue;
                    }

                    const screen = worldPosition.clone().project(camera);
                    const sx = (screen.x * 0.5 + 0.5) * canvasW;
                    const sy = (-screen.y * 0.5 + 0.5) * canvasH;

                    const feature = obj.userData.feature;
                    const featureId = feature?.objInfos?.[0]?.$id ?? obj.id ?? '';
                    const textSize = layout['text-size'] ?? 16;
                    const iconSize = layout['icon-size'] ?? 1;

                    let iconBox: { w: number; h: number } | undefined;
                    let textBox: { w: number; h: number } | undefined;

                    if (tech.name === 'labeled-icon') {
                        iconBox = { w: 32 * iconSize, h: 32 * iconSize };
                    }
                    if (tech.name === 'text' || layout['text-field']) {
                        const textWidth = tech._textWidth ?? textSize * 5;
                        const textHeight = tech._textHeight ?? textSize * 1.2;
                        textBox = { w: textWidth * textSize, h: textHeight * textSize };
                    }

                    symbols.push({
                        id: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}:${featureId}`,
                        layerId: tech._layerId ?? '',
                        featureId,
                        screenX: sx,
                        screenY: sy,
                        iconBox,
                        textBox,
                        allowOverlap: layout['icon-allow-overlap'] === true || layout['text-allow-overlap'] === true,
                        ignorePlacement: layout['icon-ignore-placement'] === true || layout['text-ignore-placement'] === true,
                        priority: typeof layout['symbol-sort-key'] === 'number'
                            ? -(layout['symbol-sort-key'] as number)
                            : (tech._renderOrder ?? 0),
                        opacity: 1,
                        object: obj,
                        variableAnchors: layout['text-variable-anchor'] as string[] | undefined,
                        textRadialOffset: layout['text-radial-offset'] as number ?? 0,
                        text: tech.text ?? tech.imageTexture ?? '',
                        tileKey: `${tile.tileKey.level}:${tile.tileKey.mortonCode()}`,
                        iconOptional: layout['icon-optional'] === true,
                    });
                }
            }

        return symbols;
    }

    /**
     * Assign stable crossTileIDs by grouping symbols per layer and matching on
     * (text content hash + quantized screen position). Symbols without text/icon
     * content get no crossTileID and fall back to layerId:featureId opacity keys.
     */
    private assignCrossTileIDs(symbols: SymbolInstance[], zoom: number): void {
        if (symbols.length === 0) return;
        const byLayer = new Map<string, SymbolInstance[]>();
        for (const sym of symbols) {
            if (!sym.text) continue;
            const arr = byLayer.get(sym.layerId);
            if (arr) arr.push(sym); else byLayer.set(sym.layerId, [sym]);
        }
        for (const [layerId, syms] of byLayer) {
            const idMap = this.m_crossTileIndex.assignIDs(layerId, syms.map(s => ({
                localId: s.id,
                text: s.text!,
                screenX: s.screenX,
                screenY: s.screenY,
                tileKey: s.tileKey ?? '',
                zoom,
            })));
            for (const s of syms) {
                const cid = idMap.get(s.id);
                if (cid) s.crossTileID = cid;
            }
        }
    }

    private applyZOrder(symbols: SymbolInstance[]): void {
        for (const sym of symbols) {
            if (!sym.object) continue;
            const tech = sym.object.userData?.technique;
            const zOrder = tech?._layout?.['symbol-z-order'] ?? 'auto';
            const overlap = sym.allowOverlap;
            switch (zOrder) {
                case 'viewport-y':
                    // Mapbox: symbols are drawn in ascending viewport-y order so
                    // the bottom-most symbol overlaps the ones above it. A higher
                    // renderOrder draws later (on top); a lower placement priority
                    // means the symbol is processed (and inserted) last.
                    sym.priority = -sym.screenY;
                    if (sym.object) sym.object.renderOrder = 1000 + sym.screenY * 0.01;
                    break;
                case 'auto':
                    // 'auto' behaves like 'viewport-y' when the symbols may
                    // overlap (and no symbol-sort-key is set); otherwise it
                    // falls back to source order (below).
                    if (overlap) {
                        sym.priority = -sym.screenY;
                        if (sym.object) sym.object.renderOrder = 1000 + sym.screenY * 0.01;
                    }
                    break;
                case 'source':
                default:
                    // 'source' (and line-placement 'auto'): draw in source
                    // feature order — the object creation order already matches
                    // the source order, so nothing to do.
                    break;
            }
        }
    }

    /**
     * Apply icon-translate, text-offset, and text-translate.
     *
     * - text-offset is in ems → converted to pixels via text-size.
     * - icon-translate / text-translate are in pixels.
     * - translate-anchor 'map' rotates the offset with bearing; 'viewport' keeps
     *   it screen-aligned.
     *
     * Offsets are applied in screen space and converted back to world using the
     * camera (unproject at the object's depth), so the shift is correct regardless
     * of zoom/pitch.
     */
    private applyOffsets(
        symbols: SymbolInstance[],
        bearing: number,
        camera: THREE.Camera,
        canvasW: number,
        canvasH: number,
    ): void {
        const bearingRad = -bearing * Math.PI / 180;
        const cosB = Math.cos(bearingRad);
        const sinB = Math.sin(bearingRad);
        const worldPos = new THREE.Vector3();
        const screen = new THREE.Vector3();
        const unproj = new THREE.Vector3();

        for (const sym of symbols) {
            const obj = sym.object as THREE.Object3D;
            if (!obj) continue;
            const tech = obj.userData?.technique;
            if (!tech) continue;

            let dxPx = 0;
            let dyPx = 0;
            let anchor: string = 'map';

            if (tech.name === 'text') {
                const layout = tech._layout ?? {};
                const textOffset = tech._textOffset ?? layout['text-offset'];
                const textSize = layout['text-size'] ?? tech.size ?? 16;
                if (Array.isArray(textOffset)) {
                    dxPx += Number(textOffset[0] ?? 0) * textSize;
                    dyPx += Number(textOffset[1] ?? 0) * textSize;
                }
                const translate = tech._textTranslate ?? tech._paint?.['text-translate'];
                if (Array.isArray(translate)) {
                    dxPx += Number(translate[0] ?? 0);
                    dyPx += Number(translate[1] ?? 0);
                    anchor = tech._textTranslateAnchor ?? tech._paint?.['text-translate-anchor'] ?? 'map';
                }
            } else if (tech.name === 'labeled-icon') {
                const layout = tech._layout ?? {};
                const iconOffset = tech._iconOffset ?? layout['icon-offset'];
                if (Array.isArray(iconOffset)) {
                    // icon-offset is in pixels: [dx, dy] (y positive = down).
                    dxPx += Number(iconOffset[0] ?? 0);
                    dyPx += Number(iconOffset[1] ?? 0);
                }
                // icon-anchor positions the icon relative to the anchor point
                // (only when there is no accompanying text-field, per Mapbox).
                if (!layout['text-field']) {
                    const iconAnchor = layout['icon-anchor'] ?? 'center';
                    const atlas = (this.m_dataSource as any).spriteAtlas;
                    const iconName = tech.imageTexture ?? layout['icon-image'];
                    const iconInfo = atlas?.icons?.get(iconName);
                    if (iconInfo && iconAnchor !== 'center') {
                        const iconScale = layout['icon-size'] ?? 1;
                        const halfW = (iconInfo.width ?? 0) * iconScale * 0.5;
                        const halfH = (iconInfo.height ?? 0) * iconScale * 0.5;
                        // NDC y-up: 'top' → content below point (−y); 'left' → content right (+x).
                        const ax = iconAnchor.includes('left') ? +halfW
                            : iconAnchor.includes('right') ? -halfW : 0;
                        const ay = iconAnchor.includes('top') ? -halfH
                            : iconAnchor.includes('bottom') ? +halfH : 0;
                        dxPx += ax;
                        dyPx += ay;
                    }
                }
                const translate = tech._iconTranslate ?? tech._paint?.['icon-translate'];
                if (Array.isArray(translate)) {
                    dxPx += Number(translate[0] ?? 0);
                    dyPx += Number(translate[1] ?? 0);
                    anchor = tech._iconTranslateAnchor ?? tech._paint?.['icon-translate-anchor'] ?? 'map';
                }
            }

            if (dxPx === 0 && dyPx === 0) {
                // Even without XY offset, check for Z offset (symbol-z-offset).
                const zOffset = Number(tech._paint?.['symbol-z-offset'] ?? tech._layout?.['symbol-z-offset'] ?? 0);
                const zElevate = tech._paint?.['symbol-z-elevate'] ?? tech._layout?.['symbol-z-elevate'] ?? false;
                if (zOffset === 0 && !zElevate) continue;
                // Apply Z offset directly to world position.
                obj.getWorldPosition(worldPos);
                const parent = obj.parent;
                if (parent) {
                    const target = worldPos.clone();
                    target.z += zOffset;
                    parent.worldToLocal(target);
                    obj.position.copy(target);
                } else {
                    obj.position.z += zOffset;
                }
                continue;
            }

            // 'map' anchor: rotate the pixel offset with bearing so it stays map-aligned.
            let ox = dxPx;
            let oy = dyPx;
            if (anchor === 'map') {
                const rx = ox * cosB - oy * sinB;
                const ry = ox * sinB + oy * cosB;
                ox = rx;
                oy = ry;
            }

            obj.getWorldPosition(worldPos);
            screen.copy(worldPos).project(camera);
            // Convert pixel offset to NDC.
            const ndx = (ox / canvasW) * 2;
            const ndy = (oy / canvasH) * 2;
            unproj.set(screen.x + ndx, screen.y + ndy, screen.z).unproject(camera);
            // Apply the world delta to the object (preserve parent transform by
            // converting delta into the object's local space).
            const parent = obj.parent;
            if (parent) {
                const delta = unproj.sub(worldPos);
                parent.worldToLocal(delta.add(obj.getWorldPosition(new THREE.Vector3())));
                obj.position.copy(delta);
            } else {
                obj.position.copy(obj.position).add(unproj.sub(worldPos));
            }

            // Also apply symbol-z-offset (world Z displacement).
            const zOffset = Number(tech._paint?.['symbol-z-offset'] ?? tech._layout?.['symbol-z-offset'] ?? 0);
            if (zOffset !== 0) {
                obj.position.z += zOffset;
            }
        }
    }

    /**
     * Force re-placement on next run (e.g., after style change).
     */
    invalidate(): void {
        this.m_lastZoom = -1;
    }
}
