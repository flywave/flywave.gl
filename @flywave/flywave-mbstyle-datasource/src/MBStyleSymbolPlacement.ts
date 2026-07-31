import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { PlacementEngine, SymbolInstance } from './PlacementEngine';
import { MBStyleDataSource } from './MBStyleDataSource';
import { getLineAnchors } from './LineAnchor';
import { CrossTileSymbolIndex } from './CrossTileSymbolIndex';

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
    private m_collisionDebug = false;
    private m_debugOverlay: THREE.LineSegments | null = null;

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

        // Assign stable cross-tile IDs so fade opacity persists across frames/tiles.
        this.assignCrossTileIDs(symbols, zoom);

        // Apply symbol-z-order: sort by viewport-y or source order
        this.applyZOrder(symbols);

        // Apply icon-translate / text-offset / text-translate (screen-space offset
        // converted back to world via the camera, honoring translate-anchor).
        this.applyOffsets(symbols, bearing, camera, w, h);

        // Apply icon-rotation-alignment
        this.applyRotationAlignment(symbols, bearing);

        // Only re-run placement if zoom changed (optimization)
        if (zoom !== this.m_lastZoom) {
            this.m_lastZoom = zoom;
            const results = this.m_placementEngine.place(symbols, Date.now(), zoom);

            for (const sym of symbols) {
                const key = sym.crossTileID
                    ? `cid:${sym.crossTileID}`
                    : `${sym.layerId}:${sym.featureId}`;
                const result = results.get(key);
                if (result && sym.object) {
                    sym.object.visible = result.opacity > 0.01;
                    if (result.opacity < 1) {
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
                    }
                }
            }
        }

        // Collision-box debug overlay.
        if (this.m_collisionDebug) {
            this.drawCollisionDebug(symbols, camera, w, h);
        } else if (this.m_debugOverlay) {
            this.m_debugOverlay.visible = false;
        }
    }

    /**
     * Draw collision boxes as colored line rectangles (debug visualization).
     * Blue = placed/visible, red = hidden/colliding.
     */
    private drawCollisionDebug(
        symbols: SymbolInstance[],
        camera: THREE.Camera,
        canvasW: number,
        canvasH: number,
    ): void {
        const scene = (this.m_mapView as any).m_scene as THREE.Scene | undefined;
        if (!scene) return;

        if (!this.m_debugOverlay) {
            const geom = new THREE.BufferGeometry();
            const mat = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                depthTest: false,
                depthWrite: false,
            });
            this.m_debugOverlay = new THREE.LineSegments(geom, mat);
            this.m_debugOverlay.frustumCulled = false;
            this.m_debugOverlay.renderOrder = 9999;
            scene.add(this.m_debugOverlay);
        }
        this.m_debugOverlay.visible = true;

        // Build line segments for each symbol's boxes in screen space, then
        // unproject to world at the symbol's depth.
        const positions: number[] = [];
        const colors: number[] = [];
        const ndc = new THREE.Vector3();
        const unproj = new THREE.Vector3();

        const addBox = (cx: number, cy: number, w: number, h: number, placed: boolean) => {
            const halfW = w / 2;
            const halfH = h / 2;
            const corners = [
                [cx - halfW, cy - halfH], [cx + halfW, cy - halfH],
                [cx + halfW, cy - halfH], [cx + halfW, cy + halfH],
                [cx + halfW, cy + halfH], [cx - halfW, cy + halfH],
                [cx - halfW, cy + halfH], [cx - halfW, cy - halfH],
            ];
            const r = placed ? 0.0 : 1.0;
            const g = placed ? 0.0 : 0.5;
            const b = placed ? 1.0 : 0.0;
            for (const [px, py] of corners) {
                ndc.set((px / canvasW) * 2 - 1, -(py / canvasH) * 2 + 1, 0.5);
                ndc.unproject(camera);
                positions.push(ndc.x, ndc.y, ndc.z);
                colors.push(r, g, b);
            }
        };

        for (const sym of symbols) {
            const placed = sym.object ? (sym.object as any).visible !== false : true;
            if (sym.iconBox) addBox(sym.screenX, sym.screenY, sym.iconBox.w, sym.iconBox.h, placed);
            if (sym.textBox) addBox(sym.screenX, sym.screenY, sym.textBox.w, sym.textBox.h, placed);
        }

        const geo = this.m_debugOverlay.geometry;
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.attributes.position.needsUpdate = true;
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

        // Iterate all tiles from the datasource
        const ds = this.m_dataSource as any;
        const tileDataSources = ds.m_mapView?.m_tileDataSources as any[];
        if (!tileDataSources) return symbols;

        for (const ds2 of tileDataSources) {
            if (ds2 !== this.m_dataSource) continue;

            // Access tiles through the tile visitor
            const tiles = ds2.m_tiles as Map<any, any> | undefined;
            if (!tiles) continue;

            for (const tile of tiles.values()) {
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
                    });
                }
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
            switch (zOrder) {
                case 'viewport-y':
                    sym.priority = sym.screenY;
                    if (sym.object) sym.object.renderOrder = 1000 - sym.screenY * 0.01;
                    break;
                case 'source':
                    break;
                case 'auto':
                default:
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

            if (dxPx === 0 && dyPx === 0) continue;

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
        }
    }

    /**
     * Force re-placement on next run (e.g., after style change).
     */
    invalidate(): void {
        this.m_lastZoom = -1;
    }
}
