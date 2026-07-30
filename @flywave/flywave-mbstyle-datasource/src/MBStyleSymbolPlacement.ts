import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { PlacementEngine, SymbolInstance } from './PlacementEngine';
import { MBStyleDataSource } from './MBStyleDataSource';
import { getLineAnchors } from './LineAnchor';

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
    private m_lastZoom = -1;

    constructor(
        private m_mapView: MapView,
        private m_dataSource: MBStyleDataSource,
    ) {}

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
                const key = `${sym.layerId}:${sym.featureId}`;
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
    }

    /**
     * Apply icon-rotation-alignment: 'map' rotates with bearing, 'viewport' stays upright.
     * Also handles text-rotation-alignment.
     */
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
                    });
                }
            }
        }

        return symbols;
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
