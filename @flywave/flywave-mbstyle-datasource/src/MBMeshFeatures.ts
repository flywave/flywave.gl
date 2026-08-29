/**
 * §547: MAPBOX_mesh_features per-part styling for batched-model tiles.
 *
 * Mirrors mgl `Tiled3dModelBucket.evaluate` + `buildMeshFeatureArray`:
 * each vertex carries a u32 feature value (V1 tiles, `_FEATURE_RGBA4444`
 * accessor read as two UINT16s) packing the partId in the low nibble and a
 * 4444 vertex color in bits 16..31 — the tiler-baked base albedo of the
 * part. mgl lerps that color toward the evaluated model-color by the part's
 * mix intensity in sRGB byte space (buildMeshFeatureArray), and the model
 * shader REPLACES the glTF albedo with the result (model.fragment.glsl
 * `mix(albedo, v_color_mix, 1.0)` for the a_pbr path — textures on these
 * tiles are occlusion maps, not base color).
 *
 * Per-part paint (model-color/-mix-intensity/-emissive-strength/-roughness)
 * is evaluated with `{part: PartNames[i]}` exactly like mgl's 7-slot table.
 * Roughness/emissive are per-material uniforms, so triangles are split into
 * one sub-mesh per part (same shared attribute buffers, per-part index
 * subsets); the color mix is baked per-vertex into the `color` attribute.
 */

import * as THREE from 'three';
import { MBExpressionEngine } from './MBExpressionEngine';
import { applyMglModelLighting } from './MBModelRenderer';
import { parseGlb } from './MBDracoDecoder';

// mgl Tiled3dModelBucket PartNames — index = the partId in the feature attr.
export const PART_NAMES = ['', 'wall', 'door', 'roof', 'window', 'lamp', 'logo'];

const FEATURE_ATTR = '_feature_rgba4444';

export function hasMeshFeatures(buffer: ArrayBuffer): boolean {
    try {
        const { json } = parseGlb(buffer);        return !!((Array.isArray(json.extensionsUsed) &&
            json.extensionsUsed.includes('MAPBOX_mesh_features')) ||
            json.asset?.extras?.MAPBOX_mesh_features);
    } catch {
        return false;
    }
}

interface PartStyle {
    colorSrgb: [number, number, number]; // 0..255 bytes (mgl lerps bytes)
    mix: number;
    roughness: number | null; // null = keep the glTF material's roughness
    emissive: number;
}

function parseRgbaBytes(v: any): [number, number, number] | null {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(String(v));
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function evalPart(paint: any, zoom: number, part: string): PartStyle {
    const props = part ? { part } : {};
    const evalRaw = (raw: any): any => {
        if (raw === undefined || raw === null) return undefined;
        try {
            if (typeof raw !== 'object') return raw;
            return MBExpressionEngine.evaluate(raw, {
                zoom,
                feature: { type: 'Point', properties: props, id: 0 },
            } as any);
        } catch {
            return undefined;
        }
    };
    const colorRaw = paint?.['model-color'];
    const colorEval = typeof colorRaw === 'object' && colorRaw !== null
        ? evalRaw(colorRaw) : colorRaw;
    const colorSrgb = parseRgbaBytes(colorEval) ?? [255, 255, 255];
    const num = (raw: any, dflt: number): number => {
        const v = evalRaw(raw);
        const n = Number(v);
        return Number.isFinite(n) ? n : dflt;
    };
    const mix = paint?.['model-color-mix-intensity'] === undefined ? 0
        : num(paint['model-color-mix-intensity'], 0);
    const roughness = paint?.['model-roughness'] === undefined
        ? null
        : num(paint['model-roughness'], 1);
    const emissive = num(paint?.['model-emissive-strength'], 0);
    return { colorSrgb, mix, roughness, emissive };
}

function expand4444(color: number): [number, number, number, number] {
    // mgl buildMeshFeatureArray 4444→8888 expansion.
    const r = ((color & 0xF000) | ((color & 0xF000) >> 4)) >> 8;
    const g = ((color & 0x0F00) | ((color & 0x0F00) >> 4)) >> 4;
    const b = (color & 0x00F0) | ((color & 0x00F0) >> 4);
    const a = ((color & 0x000F) | ((color & 0x000F) << 4)) / 255;
    return [r, g, b, a];
}

function srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Apply MAPBOX_mesh_features per-part styling to a parsed GLB tile scene.
 * `paint` is the raw layer paint (may hold data-driven expressions
 * evaluated per part with the part name property).
 */
export function applyMeshFeatures(
    root: THREE.Object3D,
    paint: any,
    zoom: number,
    dataSource: any,
): void {
    try {
        const parts = PART_NAMES.map(name => evalPart(paint, zoom, name));
        const meshes: THREE.Mesh[] = [];
        root.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry?.getAttribute?.(FEATURE_ATTR)) meshes.push(mesh);
        });
        for (const mesh of meshes) {
            splitByPart(mesh, parts, root, dataSource);
        }
        // Feature-less meshes of a features tile: mgl evaluates the layer's
        // emissive with no part property (the part-0 slot).
        root.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && !mesh.geometry.getAttribute(FEATURE_ATTR) && !mesh.userData.__mbPart) {
                applyMglModelLighting(dataSource, mesh, parts[0].emissive);
            }
        });
    } catch { /* styling must never break tile loading */ }
}

function splitByPart(
    mesh: THREE.Mesh,
    parts: PartStyle[],
    root: THREE.Object3D,
    dataSource: any,
): void {
    const geometry = mesh.geometry;
    const feature = geometry.getAttribute(FEATURE_ATTR) as THREE.BufferAttribute;
    const index = geometry.getIndex();
    if (!feature || !index) return;
    const u16 = feature.array as Uint16Array;
    const vertCount = feature.count;

    // Per-vertex partId + the mixed, linear-space vertex color.
    const partOf = new Uint8Array(vertCount);
    const colors = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
        const u32 = (u16[i * 2] | (u16[i * 2 + 1] << 16)) >>> 0;
        const rawPart = u32 & 0xf;
        const partId = rawPart < parts.length ? rawPart : 0;
        partOf[i] = partId;
        const style = parts[partId];
        let [r, g, b] = expand4444((u32 >>> 16) & 0xffff);
        if (style.mix > 0) {
            // mgl lerps in sRGB byte space before the shader converts.
            r = Math.round(r + (style.colorSrgb[0] - r) * style.mix);
            g = Math.round(g + (style.colorSrgb[1] - g) * style.mix);
            b = Math.round(b + (style.colorSrgb[2] - b) * style.mix);
        }
        colors[i * 3] = srgbToLinear(r / 255);
        colors[i * 3 + 1] = srgbToLinear(g / 255);
        colors[i * 3 + 2] = srgbToLinear(b / 255);
    }

    // Group triangle indices by part (tiler authors uniform parts per face).
    const byPart = new Map<number, number[]>();
    const idx = index.array as ArrayLike<number>;
    for (let t = 0; t < index.count; t += 3) {
        const partId = partOf[idx[t]] ?? 0;
        let list = byPart.get(partId);
        if (!list) { list = []; byPart.set(partId, list); }
        list.push(idx[t], idx[t + 1], idx[t + 2]);
    }

    const sharedColor = new THREE.BufferAttribute(colors, 3);
    const parent = mesh.parent ?? root;
    const subMeshes: THREE.Mesh[] = [];
    for (const [partId, indices] of byPart) {
        const style = parts[partId] ?? parts[0];
        const subGeo = new THREE.BufferGeometry();
        // Share the source attribute buffers; only indices are per part.
        for (const name of Object.keys(geometry.attributes)) {
            if (name === FEATURE_ATTR) continue;
            subGeo.setAttribute(name, geometry.getAttribute(name));
        }
        subGeo.setAttribute('color', sharedColor);
        subGeo.setIndex(new THREE.BufferAttribute(
            vertCount <= 65535 && geometry.index.array instanceof Uint16Array
                ? new Uint16Array(indices) : new Uint32Array(indices), 1));
        const mat: any = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.clone()
            ?? new THREE.MeshStandardMaterial();
        // mgl a_pbr path: vertex color REPLACES the glTF albedo (mix=1.0),
        // so the material's base color factor must not tint it again.
        mat.vertexColors = true;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if (style.roughness !== null) mat.roughness = style.roughness;
        const sub = new THREE.Mesh(subGeo, mat);
        sub.position.copy(mesh.position);
        sub.quaternion.copy(mesh.quaternion);
        sub.scale.copy(mesh.scale);
        sub.renderOrder = mesh.renderOrder;
        sub.frustumCulled = mesh.frustumCulled;
        sub.userData.__mbPart = partId;
        applyMglModelLighting(dataSource, sub, style.emissive);
        subMeshes.push(sub);
    }

    parent.add(...subMeshes);
    parent.remove(mesh);
}
