import {
    DecodedTile,
    Geometry,
    IndexedTechnique,
    BufferAttribute,
    BufferElementType,
    Group,
    GeometryType,
    AttributeMap,
    InterleavedBufferAttribute,
    TextGeometry,
    TextPathGeometry,
    PoiGeometry,
} from '@flywave/flywave-datasource-protocol';
import { TileKey, webMercatorProjection } from '@flywave/flywave-geoutils';
import * as THREE from 'three';

import { EvaluatedLayer } from './MBLayerEvaluator';
import { ILineGeometry, IPolygonGeometry } from '@flywave/flywave-vectortile-datasource/IGeometryProcessor';
import { DecodeInfo } from '@flywave/flywave-vectortile-datasource/DecodeInfo';
import { createLineGeometry, LineGroup } from '@flywave/flywave-lines';
import { resolveTextField, applyTextTransform, shapeText } from './TextShaping';
import { EarthConstants } from '@flywave/flywave-geoutils';

// Use earcut for proper polygon triangulation (concave + holes)
import earcut from 'earcut';

interface AccumulatedGeometry {
    positions: number[];
    indices: number[];
    groups: Array<{ start: number; count: number; materialIndex: number; sortKey?: number }>;
    featureStarts: number[];
    objInfos: AttributeMap[];
}

const tmpV3 = new THREE.Vector3();
const EXTENTS = 4096;

/**
 * Convert tile-local coordinates to world coordinates.
 * Inlined from OmvUtils to avoid exports field resolution issues.
 *
 * For the built-in Web-Mercator / Spherical (globe) projections this uses
 * the same fast integer-tile math as before — flywave's engine reprojects
 * Mercator world coords onto the sphere itself. For custom MBMapProjection
 * instances (Albers, EqualEarth, WinkelTripel, …) each tile-local point is
 * first lifted to its (lng, lat) and then run through the active
 * projection's `projectPoint`, so vector features land in the correct
 * projection-space position instead of being placed as a flat Mercator slab.
 */
function lat2tile(lat: number, zoom: number): number {
    return Math.round(
        ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom)
    );
}

/**
 * Inverse of the Web-Mercator tile y mapping: given the tile's northern
 * latitude `north`, the integer `top` tile row, the per-tile `py` pixel
 * offset and the global `scale` (= 2^(level+N)), return the geographic
 * latitude of the requested point. Used to feed custom projections.
 */
function tileYToLat(top: number, py: number, scale: number): number {
    const n = Math.PI - (2 * Math.PI * (top + py)) / scale;
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * Maximum tile-local distance (in tile-extent units) that a single line
 * segment may cover without being subdivided under a non-Mercator custom
 * projection. 32 px on a 4096-px tile ≈ 0.78% of the tile width — small
 * enough that the chord and the true projected curve differ by sub-pixel
 * amounts at every zoom level we render tests at.
 */
const RESAMPLE_MAX_SEG_PX = 32;

/**
 * Recursive midpoint subdivision of a tile-local polyline. Subdivides any
 * segment longer than `RESAMPLE_MAX_SEG_PX` until all segments are short
 * enough that reprojecting them through a non-linear projection yields an
 * effectively smooth curve. Points are interpolated linearly in tile-local
 * space — equivalent to interpolating in Web-Mercator world space — which is
 * the closest approximation of a rhumb-line on the sphere and matches
 * Mapbox's `resample.ts` behaviour for short distances.
 */
function resampleLinePoints(
    positions: ArrayLike<THREE.Vector2 | THREE.Vector3>,
    _extents: number,
): (THREE.Vector2 | THREE.Vector3)[] {
    const n = positions.length;
    if (n < 2) {
        const copy: (THREE.Vector2 | THREE.Vector3)[] = [];
        for (let i = 0; i < n; i++) copy.push(positions[i]);
        return copy;
    }
    const out: (THREE.Vector2 | THREE.Vector3)[] = [positions[0]];
    for (let i = 1; i < n; i++) {
        subdivideInto(positions[i - 1], positions[i], out);
    }
    return out;
}

function subdivideInto(
    a: THREE.Vector2 | THREE.Vector3,
    b: THREE.Vector2 | THREE.Vector3,
    out: (THREE.Vector2 | THREE.Vector3)[],
): void {
    // Use a stack-based iterative subdivision to avoid pathological
    // recursion on very long segments.
    const stack: Array<[THREE.Vector2 | THREE.Vector3, THREE.Vector2 | THREE.Vector3]> = [[a, b]];
    while (stack.length > 0) {
        const [pa, pb] = stack.pop()!;
        const dx = (pb as any).x - (pa as any).x;
        const dy = (pb as any).y - (pa as any).y;
        const dist = Math.hypot(dx, dy);
        if (dist <= RESAMPLE_MAX_SEG_PX) {
            out.push(pb);
            continue;
        }
        // Insert midpoint and recurse on each half. Construct the same
        // vector type as the input to preserve downstream typing.
        const mid = (pa as any).clone
            ? (pa as any).clone().lerp(pb, 0.5)
            : new THREE.Vector2((pa as any).x + dx * 0.5, (pa as any).y + dy * 0.5);
        stack.push([mid, pb]);
        stack.push([pa, mid]);
    }
}

function tile2world(
    extents: number,
    decodeInfo: DecodeInfo,
    px: number, py: number,
    target: THREE.Vector3,
): void {
    const { north, west } = decodeInfo.geoBox;
    const N = Math.log2(extents);
    const scale = Math.pow(2, decodeInfo.tileKey.level + N);
    const top = lat2tile(north, decodeInfo.tileKey.level + N);
    const left = Math.round(((west + 180) / 360) * scale);
    const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

    const proj: any = decodeInfo.targetProjection;
    if (proj?.mbCustomProjection === true) {
        // Reproject: tile-local → (lng, lat) → custom-projection world.
        const lng = ((left + px) / scale) * 360 - 180;
        const lat = tileYToLat(top, py, scale);
        const w = proj.projectPoint({ longitude: lng, latitude: lat, altitude: 0 });
        target.x = w.x;
        target.y = w.y;
        target.z = (w as any).z ?? 0;
        target.sub(decodeInfo.center);
        return;
    }

    target.x = ((left + px) / scale) * R;
    target.y = ((top + py) / scale) * R;
    target.z = 0;
    target.sub(decodeInfo.center);
}

export class MBTileDataEmitter {
    private m_geometries: Map<string, AccumulatedGeometry> = new Map();
    private m_techniqueIndex = 0;
    private m_techniques: IndexedTechnique[] = [];
    private m_layerToTechniqueIndex: Map<string, number> = new Map();
    /**
     * Optional real-font glyph metrics (from PBF), used as the `glyphLookup`
     * for accurate text shaping. Set by the decoder when the main thread has
     * preloaded mapbox glyph ranges for the style's font stacks.
     */
    private m_glyphLookup: { getMetrics: (font: string, char: string) => any } | undefined;

    constructor(
        private m_tileKey: TileKey,
        private m_decodeInfo: DecodeInfo,
        private m_zoom: number,
    ) {}

    /** Install a real-font metrics lookup for text shaping. */
    setGlyphLookup(lookup: { getMetrics: (font: string, char: string) => any }): void {
        this.m_glyphLookup = lookup;
    }

    private m_textGeometries: TextGeometry[] = [];
    private m_textPathGeometries: TextPathGeometry[] = [];
    private m_poiGeometries: PoiGeometry[] = [];
    private m_stringCatalog: string[] = [];
    private m_stringIndex: Map<string, number> = new Map();

    private getStringIndex(s: string): number {
        let idx = this.m_stringIndex.get(s);
        if (idx === undefined) {
            idx = this.m_stringCatalog.length;
            this.m_stringCatalog.push(s);
            this.m_stringIndex.set(s, idx);
        }
        return idx;
    }

    /**
     * The tile extent (default 4096). Set per-tile by the adapter via
     * `setExtents()` so non-standard tile sizes (e.g. 1024) are handled
     * correctly in coordinate conversion.
     */
    private m_extents: number = 4096;

    /** Set the tile extent (called by the decoder before processing). */
    setExtents(extents: number): void {
        this.m_extents = extents > 0 ? extents : 4096;
    }

    get extents(): number { return this.m_extents; }

    private getOrCreateGeometry(key: string): AccumulatedGeometry {
        let geo = this.m_geometries.get(key);
        if (!geo) {
            geo = { positions: [], indices: [], groups: [], featureStarts: [], objInfos: [] };
            this.m_geometries.set(key, geo);
        }
        return geo;
    }

    private project(p: THREE.Vector2 | THREE.Vector3): THREE.Vector3 {
        tile2world(this.m_extents, this.m_decodeInfo, p.x, p.y, tmpV3);
        // Apply line-z-offset if set (for elevated lines)
        if (this.m_currentZOffset !== 0) {
            tmpV3.z += this.m_currentZOffset;
        }
        return tmpV3.clone();
    }

    private m_currentZOffset: number = 0;

    /**
     * Resolve the per-feature Z offset for a layer, combining:
     *   - the explicit `<type>-z-offset` paint/layout property, and
     *   - the `<type>-elevation-reference` layout property, which reads the
     *     feature's `elevation`/`height`/`z`/`level` property and lifts the
     *     feature to that height (HD elevated-line / bridge support).
     *
     * `type` is the layer type prefix: 'fill', 'line', or 'fill-extrusion'.
     */
    private resolveZOffset(
        layer: EvaluatedLayer,
        properties: Record<string, any> | undefined,
        type: 'fill' | 'line' | 'fill-extrusion',
    ): number {
        const paint = layer.paint ?? {};
        const layout = layer.layout ?? {};

        // Explicit z-offset property.
        let z = Number(paint[`${type}-z-offset`] ?? layout[`${type}-z-offset`] ?? 0);

        // HD elevation reference: lift feature to its real-world elevation.
        const elevRef = layout[`${type}-elevation-reference`];
        if (elevRef) {
            const featElev = Number(
                properties?.elevation ?? properties?.height ??
                properties?.z ?? properties?.level ?? 0,
            );
            z += elevRef === 'hd-road-markup'
                ? featElev + 0.1 // markup sits slightly above the road surface
                : featElev;
        }
        return z;
    }

    private extractSortKey(layer: EvaluatedLayer): number | undefined {
        const layout = layer.layout ?? {};
        const sk = layout['fill-sort-key']
            ?? layout['line-sort-key']
            ?? layout['circle-sort-key']
            ?? layout['symbol-sort-key'];
        return typeof sk === 'number' ? sk : undefined;
    }

    private paintToTechniqueProps(layer: EvaluatedLayer, properties?: Record<string, any>, symbolMode?: 'icon' | 'text'): Record<string, any> {
        const p = layer.paint;
        const l = layer.layout;
        const props: Record<string, any> = {};

        switch (layer.type) {
            case 'background':
                props.technique = 'fill';
                props.color = p['background-color'] ?? '#000000';
                props.opacity = p['background-opacity'] ?? 1;
                props.renderOrder = -Infinity;
                break;
            case 'fill':
                props.technique = 'fill';
                props.color = p['fill-color'] ?? '#000000';
                props.opacity = p['fill-opacity'] ?? 1;
                props.outlineColor = p['fill-outline-color'];
                props._translate = p['fill-translate'] ?? [0, 0];
                props._translateAnchor = p['fill-translate-anchor'] ?? 'map';
                if (p['fill-pattern']) {
                    props._patternName = p['fill-pattern'];
                    props._patternCrossFade = p['fill-pattern-cross-fade'] ?? 1;
                }
                // HD elevation reference: roads/markings at their feature elevation.
                const fillElevRef = l['fill-elevation-reference'];
                if (fillElevRef) {
                    const featElev = Number(properties?.elevation ?? properties?.height ?? properties?.z ?? properties?.level ?? 0);
                    props._hdElevation = fillElevRef === 'hd-road-markup'
                        ? featElev + 0.1  // markup sits slightly above road surface
                        : featElev;
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'line':
                props.technique = 'solid-line';
                props.color = p['line-color'] ?? '#000000';
                props.opacity = p['line-opacity'] ?? 1;
                props.lineWidth = p['line-width'] ?? 1;
                // Mapbox line-width/offset/dash values are in CSS pixels — the
                // SolidLineMaterial converts them to world units via metricUnit.
                props.metricUnit = 'Pixel';
                props._translate = p['line-translate'] ?? [0, 0];
                props._translateAnchor = p['line-translate-anchor'] ?? 'map';
                // HD elevation reference: stored on the technique as
                // `_hdElevation` for the MaterialPatchManager; the per-feature
                // Z offset that lifts the line geometry itself is computed
                // centrally in `resolveZOffset()` (called by processLineFeature).
                const lineElevRef = l['line-elevation-reference'];
                if (lineElevRef) {
                    const featElev = Number(properties?.elevation ?? properties?.height ?? properties?.z ?? 0);
                    props._hdElevation = lineElevRef === 'hd-road-markup'
                        ? featElev + 0.1
                        : featElev;
                }
                if (p['line-pattern']) {
                    props._patternName = p['line-pattern'];
                    props._patternCrossFade = p['line-pattern-cross-fade'] ?? 1;
                }
                if (p['line-dasharray']) {
                    const arr = p['line-dasharray'] as number[];
                    // Mapbox line-dasharray values are multiples of the line
                    // width, so the dash scales with zoom when line-width is a
                    // zoom function. Multiply by the (pixel) line-width here;
                    // metricUnit:'Pixel' then converts the product to world units.
                    const lw = (props.lineWidth as number) ?? 1;
                    if (arr.length >= 2) {
                        props.dashSize = arr[0] * lw;
                        props.gapSize = arr[1] * lw;
                        if (arr.length > 2) {
                            props.dashArray = arr.map((v: number) => v * lw);
                            let sum = 0;
                            for (const v of arr) sum += v * lw;
                            props.dashTotalLength = sum;
                        }
                    }
                }
                if (p['line-gradient']) {
                    props._lineGradientStops = p['line-gradient'];
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'circle':
                props.technique = 'circles';
                props.color = p['circle-color'] ?? '#000000';
                props.opacity = p['circle-opacity'] ?? 1;
                props.size = p['circle-radius'] ?? 5;
                props._translate = p['circle-translate'] ?? [0, 0];
                props._translateAnchor = p['circle-translate-anchor'] ?? 'map';
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'symbol':
                // When both icon-image and text-field are present, emit two
                // techniques (icon + text) so labels render with icon + caption.
                // symbolMode selects which one this call builds.
                if (symbolMode === 'icon' || (symbolMode === undefined && l['icon-image'])) {
                    props.technique = 'labeled-icon';
                    props.imageTexture = l['icon-image'];
                    props.color = p['icon-color'] ?? '#000000';
                    props.opacity = p['icon-opacity'] ?? 1;
                    props.iconScale = l['icon-size'] ?? 1;
                    props._iconTranslate = p['icon-translate'] ?? [0, 0];
                    props._iconTranslateAnchor = p['icon-translate-anchor'] ?? 'map';
                    props._iconOffset = l['icon-offset'];
                    if (l.visibility === 'none') props.enabled = false;
                } else if (symbolMode === 'text' || (symbolMode === undefined && l['text-field'])) {
                    props.technique = 'text';
                    // Resolve text field with token replacement using feature properties
                    const rawText = typeof l['text-field'] === 'string'
                        ? l['text-field']
                        : String(l['text-field'] ?? '');
                    const resolvedText = resolveTextField(rawText, properties ?? {});

                    // Apply text transform
                    const transform = l['text-transform'] ?? 'none';
                    const transformedText = applyTextTransform(resolvedText, transform);

                    props.text = transformedText;
                    props.color = p['text-color'] ?? '#000000';
                    props.opacity = p['text-opacity'] ?? 1;
                    props.size = l['text-size'] ?? 16;
                    props.fontName = l['text-font']?.[0];

                    // Pre-compute shaped text for layout
                    const shaped = shapeText(transformedText, {
                        fontSize: l['text-size'] ?? 16,
                        maxWidth: l['text-max-width'] ?? 10,
                        lineHeight: l['text-line-height'] ?? 1.2,
                        letterSpacing: l['text-letter-spacing'] ?? 0,
                        justify: l['text-justify'] ?? 'center',
                        anchor: l['text-anchor'] ?? 'center',
                        transform: 'none', // already applied above
                        writingMode: l['text-writing-mode'] as ('horizontal' | 'vertical')[],
                        glyphLookup: this.m_glyphLookup as any,
                        fontName: Array.isArray(l['text-font']) ? l['text-font'].join(',') : l['text-font'],
                    });
                    props._shaped = shaped;
                    props._textWidth = shaped.right - shaped.left;
                    props._textHeight = shaped.bottom - shaped.top;
                    props._textOffset = l['text-offset'];
                    props._textTranslate = p['text-translate'] ?? [0, 0];
                    props._textTranslateAnchor = p['text-translate-anchor'] ?? 'map';

                    if (l.visibility === 'none') props.enabled = false;
                }
                break;
            case 'fill-extrusion':
                props.technique = 'extruded-polygon';
                props.color = p['fill-extrusion-color'] ?? '#000000';
                props.opacity = p['fill-extrusion-opacity'] ?? 1;
                props.height = p['fill-extrusion-height'] ?? 0;
                props.floorHeight = p['fill-extrusion-base'] ?? 0;
                props._translate = p['fill-extrusion-translate'] ?? [0, 0];
                props._translateAnchor = p['fill-extrusion-translate-anchor'] ?? 'map';
                if (p['fill-extrusion-pattern']) {
                    props._patternName = p['fill-extrusion-pattern'];
                    props._patternCrossFade = p['fill-extrusion-pattern-cross-fade'] ?? 1;
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'heatmap':
                // Native pipeline has no 'heatmap' technique guard, so emit as
                // 'circles' (which produces point geometry) and flag it so the
                // MaterialPatchManager can apply a heatmap-style shader.
                props.technique = 'circles';
                props._isHeatmap = true;
                props.color = '#0000ff';
                props.opacity = p['heatmap-opacity'] ?? 1;
                props.size = p['heatmap-radius'] ?? 30;
                props._heatmapIntensity = p['heatmap-intensity'] ?? 1;
                props._heatmapWeight = p['heatmap-weight'] ?? 1;
                props._heatmapColorStops = p['heatmap-color'] ?? [[0, 'rgba(0,0,255,0)'], [0.5, 'blue'], [1, 'red']];
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'hillshade':
                // Native pipeline has no 'hillshade' technique guard, so emit as
                // 'fill' (textured polygon) and flag it. The per-tile DEM url is
                // carried via feature properties (_hillshadeDemUrl) for the patcher.
                props.technique = 'fill';
                props._isHillshade = true;
                props._hillshadeDemUrl = properties?._hillshadeDemUrl ?? '';
                // Carry the source tileSize so the patcher can compute the DEM
                // border/buffer from the loaded image dimensions.
                props._hillshadeTileSize = properties?._tileSize ?? 256;
                props.color = p['hillshade-shadow-color'] ?? '#000000';
                props.opacity = 1;
                props._hillshadeIntensity = p['hillshade-exaggeration'] ?? 0.5;
                props._hillshadeAccent = p['hillshade-accent-color'] ?? '#ffffff';
                props._hillshadeHighlight = p['hillshade-highlight-color'] ?? '#ffffff';
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'raster':
                props.technique = 'fill';
                props.color = '#ffffff';
                props.opacity = p['raster-opacity'] ?? 1;
                props._rasterTileUrl = properties?._rasterTileUrl ?? '';
                props._isRaster = true;
                // Pass through raster color-adjustment paint properties
                // so MaterialPatchManager can inject them as shader uniforms.
                props._rasterHueRotate = p['raster-hue-rotate'] ?? 0;
                props._rasterBrightnessMin = p['raster-brightness-min'] ?? 0;
                props._rasterBrightnessMax = p['raster-brightness-max'] ?? 1;
                props._rasterSaturation = p['raster-saturation'] ?? 0;
                props._rasterContrast = p['raster-contrast'] ?? 0;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'model':
                props.technique = 'model';
                props.modelId = l['model-id'] ?? properties?.['model-id'] ?? '';
                props.opacity = 1;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'building':
                props.technique = 'extruded-polygon';
                props.color = p['building-color'] ?? '#cccccc';
                props.opacity = 1;
                props.height = p['building-height'] ?? properties?.height ?? properties?.['building-height'] ?? properties?.['height'] ?? 10;
                props.floorHeight = p['building-base'] ?? properties?.base ?? properties?.['building-base'] ?? 0;
                props._roofColor = p['building-roof-color'] ?? '#aaaaaa';
                if (l.visibility === 'none') props.enabled = false;
                break;
        }
        return props;
    }

    private getOrCreateTechniqueIndex(layer: EvaluatedLayer, properties?: Record<string, any>, symbolMode?: 'icon' | 'text'): number {
        // For text layers, technique key includes resolved text to allow per-feature text
        const textKey = layer.type === 'symbol' && layer.layout['text-field']
            ? resolveTextField(
                typeof layer.layout['text-field'] === 'string' ? layer.layout['text-field'] : '',
                properties ?? {},
            )
            : '';

        const cacheKey = `${layer.id}:${symbolMode ?? ''}:${textKey}`;
        let idx = this.m_layerToTechniqueIndex.get(cacheKey);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(cacheKey, idx);
            const props = this.paintToTechniqueProps(layer, properties, symbolMode);
            const technique: any = {
                name: props.technique,
                _index: idx,
                _renderOrder: layer.renderOrder,
                renderOrder: layer.renderOrder, // Standard flywave property read by TileGeometryCreator
                _layerId: layer.id,
                _paint: layer.paint,
                _layout: layer.layout,
                ...props,
            };
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    processFillFeature(
        layerName: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            this.m_currentZOffset = this.resolveZOffset(layer, properties, 'fill');
            const key = `${layer.id}:fill`;
            const geo = this.getOrCreateGeometry(key);
            const featureStart = geo.indices.length;

            for (const polygon of geometry) {
                const rings = polygon.rings;
                if (rings.length === 0) continue;

                // fill-limit-number-holes: cap the number of interior rings.
                const maxHoles = layer.paint['fill-limit-number-holes'] as number | undefined;
                const effectiveRings = (maxHoles !== undefined && maxHoles >= 0)
                    ? [rings[0], ...rings.slice(1, 1 + maxHoles)]
                    : rings;

                // Use earcut for proper polygon triangulation with hole support
                const allVerts: number[] = [];
                const holeIndices: number[] = [];

                // Exterior ring
                for (const pt of effectiveRings[0]) {
                    allVerts.push(pt.x, pt.y);
                }

                // Interior rings (holes)
                for (let r = 1; r < effectiveRings.length; r++) {
                    holeIndices.push(allVerts.length / 2);
                    for (const pt of effectiveRings[r]) {
                        allVerts.push(pt.x, pt.y);
                    }
                }

                // Triangulate with earcut
                const triIndices = earcut(allVerts, holeIndices.length > 0 ? holeIndices : null, 2);

                // Project and store vertices
                const startIdx = geo.positions.length / 3;
                const vertCount2d = allVerts.length / 2;
                for (let i = 0; i < vertCount2d; i++) {
                    const w = this.project(
                        new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1])
                    );
                    geo.positions.push(w.x, w.y, 0);
                }

                // Store triangulated indices
                for (let i = 0; i < triIndices.length; i++) {
                    geo.indices.push(triIndices[i] + startIdx);
                }
            }

            const count = geo.indices.length - featureStart;
            if (count > 0) {
                geo.groups.push({
                    start: featureStart,
                    count,
                    materialIndex: techniqueIdx,
                    sortKey: this.extractSortKey(layer),
                });
                geo.featureStarts.push(featureStart);
                geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
            }
        }
    }

    // Interleaved vertex data for triangulated lines
    private m_lineInterleaved: number[] = [];
    private m_lineIndices: number[] = [];
    private m_lineGroupStarts: number[] = [];
    private m_lineSortKeys: number[] = [];
    private m_lineAttr: string[] = [];

    processLineFeature(
        layerName: string,
        extents: number,
        geometry: ILineGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        const needsResample = (this.m_decodeInfo.targetProjection as any)?.mbCustomProjection === true;
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            this.m_currentZOffset = this.resolveZOffset(layer, properties, 'line');

            for (const lineGeo of geometry) {
                // Convert tile-local to world. Under a non-Mercator custom
                // projection, subdivide each segment first so straight
                // geographic lines bend smoothly when reprojected (Albers,
                // EqualEarth, …) instead of becoming chordal polylines.
                const pts = needsResample
                    ? resampleLinePoints(lineGeo.positions, extents)
                    : lineGeo.positions;

                const worldPts: number[] = [];
                for (const pt of pts) {
                    const w = this.project(pt);
                    worldPts.push(w.x, w.y, w.z);
                }

                const center = this.m_decodeInfo.center;
                const lineGeom = createLineGeometry(center, worldPts, webMercatorProjection);

                // Store interleaved vertex data + remapped indices
                const stride = 13; // extrusionCoord(3)+position(3)+tangent(3)+biTangent(4)
                const baseVert = this.m_lineInterleaved.length / stride;
                this.m_lineInterleaved.push(...lineGeom.vertices);

                for (const idx of lineGeom.indices) {
                    this.m_lineIndices.push(idx + baseVert);
                }

                const start = this.m_lineIndices.length - lineGeom.indices.length;
                const fid = featureId ?? properties.$id ?? null;
                this.m_lineGroupStarts.push(start, techniqueIdx);
                this.m_lineSortKeys.push(this.extractSortKey(layer) ?? 0);
                this.m_lineAttr.push(JSON.stringify({ ...properties, $id: fid }));
            }
        }
    }

    /** Get stored triangulated line data for building the DecodedTile */
    private getLineGeometries(): Geometry[] {
        if (this.m_lineInterleaved.length === 0 || this.m_lineIndices.length === 0) return [];

        const data = new Float32Array(this.m_lineInterleaved);
        const indices = new Uint32Array(this.m_lineIndices);

        const interleavedAttr: InterleavedBufferAttribute = {
            buffer: data.buffer,
            stride: 13,
            type: 'float' as BufferElementType,
            attributes: [
                { name: 'extrusionCoord', offset: 0, itemSize: 3 },
                { name: 'position', offset: 3, itemSize: 3 },
                { name: 'tangent', offset: 6, itemSize: 3 },
                { name: 'biTangent', offset: 9, itemSize: 4 },
            ],
        };

        const groups: Group[] = [];
        const end = this.m_lineIndices.length;
        const numGroups = this.m_lineGroupStarts.length / 2;
        const order = Array.from({ length: numGroups }, (_, i) => i);
        if (numGroups > 1 && this.m_lineSortKeys.some(k => k !== 0)) {
            order.sort((a, b) => this.m_lineSortKeys[a] - this.m_lineSortKeys[b]);
        }
        const sortedAttrs: AttributeMap[] = [];
        for (const i of order) {
            const start = this.m_lineGroupStarts[i * 2];
            const nextIdx = order.indexOf(i + 1);
            const nextStart = (i + 1) < numGroups
                ? this.m_lineGroupStarts[(i + 1) * 2] : end;
            groups.push({
                start,
                count: nextStart - start,
                technique: this.m_lineGroupStarts[i * 2 + 1],
            });
            sortedAttrs.push(JSON.parse(this.m_lineAttr[i]));
        }

        return [{
            type: GeometryType.SolidLine,
            interleavedVertexAttributes: [interleavedAttr],
            index: {
                name: 'index',
                buffer: indices.buffer,
                type: 'uint32' as BufferElementType,
                itemCount: 1,
            },
            groups,
            featureStarts: groups.map(g => g.start),
            objInfos: sortedAttrs,
            attachments: [],
        }];
    }

    processPointFeature(
        layerName: string,
        extents: number,
        points: THREE.Vector3[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        for (const layer of matchedLayers) {
            // Determine which symbol sub-techniques to emit. For symbol layers with
            // both icon-image and text-field, emit both so icon+caption render.
            let modes: Array<'icon' | 'text' | undefined>;
            if (layer.type === 'symbol' && layer.layout['icon-image'] && layer.layout['text-field']) {
                modes = ['icon', 'text'];
            } else {
                modes = [undefined];
            }

            for (const mode of modes) {
                const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties, mode);
                const key = `${layer.id}:point:${techniqueIdx}`;
                const geo = this.getOrCreateGeometry(key);
                const featureStart = geo.indices.length;

                const tech = this.m_techniques[techniqueIdx];

                for (const pt of points) {
                    const w = this.project(pt);
                    geo.positions.push(w.x, w.y, w.z);

                    // Emit native text/POI geometry for the TextElementsRenderer.
                    if (tech.name === 'text' && tech.text) {
                        this.emitTextGeometry(techniqueIdx, w, tech.text as string,
                            { ...properties, $id: featureId ?? properties.$id ?? null });
                    } else if (tech.name === 'labeled-icon') {
                        const iconName = tech.imageTexture as string;
                        const caption = (layer.layout['text-field'] && mode === 'icon')
                            ? '' : (tech.text as string ?? '');
                        this.emitPoiGeometry(techniqueIdx, w,
                            iconName ?? '',
                            caption || undefined,
                            { ...properties, $id: featureId ?? properties.$id ?? null });
                    }
                }

                const count = points.length;
                geo.groups.push({
                    start: featureStart,
                    count,
                    materialIndex: techniqueIdx,
                    sortKey: this.extractSortKey(layer),
                });
                geo.featureStarts.push(featureStart);
                geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
            }
        }
    }

    /** Emit a TextGeometry entry for the native TextElementsRenderer. */
    private emitTextGeometry(
        techniqueIdx: number,
        pos: THREE.Vector3,
        text: string,
        attrs: AttributeMap,
    ): void {
        // Find or create a TextGeometry group for this technique.
        let tg = this.m_textGeometries.find(t => t.technique === techniqueIdx);
        if (!tg) {
            tg = {
                positions: {
                    name: 'position',
                    buffer: new Float32Array(0).buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 3,
                },
                texts: [],
                technique: techniqueIdx,
                stringCatalog: this.m_stringCatalog,
                objInfos: [],
            };
            this.m_textGeometries.push(tg);
        }
        // Accumulate positions in a temporary array, finalize in getDecodedTile.
        if (!(tg as any)._positions) (tg as any)._positions = [];
        (tg as any)._positions.push(pos.x, pos.y, pos.z);
        tg.texts.push(this.getStringIndex(text));
        tg.objInfos!.push(attrs);
    }

    /** Emit a PoiGeometry entry for the native PoiRenderer. */
    private emitPoiGeometry(
        techniqueIdx: number,
        pos: THREE.Vector3,
        iconName: string,
        caption: string | undefined,
        attrs: AttributeMap,
    ): void {
        let pg = this.m_poiGeometries.find(p => p.technique === techniqueIdx);
        if (!pg) {
            pg = {
                positions: {
                    name: 'position',
                    buffer: new Float32Array(0).buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 3,
                },
                texts: [],
                technique: techniqueIdx,
                stringCatalog: this.m_stringCatalog,
                objInfos: [],
                imageTextures: [],
            };
            this.m_poiGeometries.push(pg);
        }
        if (!(pg as any)._positions) (pg as any)._positions = [];
        (pg as any)._positions.push(pos.x, pos.y, pos.z);
        pg.texts.push(this.getStringIndex(caption ?? ''));
        pg.imageTextures!.push(this.getStringIndex(iconName));
        pg.objInfos!.push(attrs);
    }

    getDecodedTile(): DecodedTile {
        const geometries: Geometry[] = [];

        for (const [, geo] of this.m_geometries) {
            if (geo.positions.length === 0) continue;

            if (geo.groups.length > 1 && geo.groups.some(g => g.sortKey !== undefined)) {
                geo.groups.sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0));
            }

            const positionArray = new Float32Array(geo.positions);
            const indexArray = geo.indices.length > 0 ? new Uint32Array(geo.indices) : undefined;

            const positionAttr: BufferAttribute = {
                name: 'position',
                buffer: positionArray.buffer,
                type: 'float' as BufferElementType,
                itemCount: 3,
            };

            const groups: Group[] = geo.groups.map(g => ({
                start: g.start,
                count: g.count,
                technique: g.materialIndex,
            }));

            const geom: Geometry = {
                type: GeometryType.Polygon,
                vertexAttributes: [positionAttr],
                groups,
                featureStarts: geo.featureStarts,
                objInfos: geo.objInfos,
                attachments: [],
            };

            if (indexArray) {
                geom.index = {
                    name: 'index',
                    buffer: indexArray.buffer,
                    type: 'uint32' as BufferElementType,
                    itemCount: 1,
                };
            }

            geometries.push(geom);
        }

        const lineGeoms = this.getLineGeometries();

        // Finalize text/POI geometries: convert temp arrays to BufferAttributes.
        for (const tg of [...this.m_textGeometries, ...this.m_poiGeometries] as any[]) {
            const positions = (tg as any)._positions as number[] | undefined;
            if (positions && positions.length > 0) {
                const arr = new Float32Array(positions);
                tg.positions = {
                    name: 'position',
                    buffer: arr.buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 3,
                };
            }
        }

        const decodedTile: DecodedTile = {
            techniques: this.m_techniques,
            geometries: [...geometries, ...lineGeoms],
        };

        // Emit text/POI geometries so the native TextElementsRenderer/PoiRenderer
        // can find them. Without these, no text or icons render.
        if (this.m_textGeometries.length > 0) {
            decodedTile.textGeometries = this.m_textGeometries;
        }
        if (this.m_textPathGeometries.length > 0) {
            decodedTile.textPathGeometries = this.m_textPathGeometries;
        }
        if (this.m_poiGeometries.length > 0) {
            decodedTile.poiGeometries = this.m_poiGeometries;
        }

        return decodedTile;
    }
}
