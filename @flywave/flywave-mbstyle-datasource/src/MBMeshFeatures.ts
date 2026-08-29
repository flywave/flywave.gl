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
import { applyMglModelLighting, MBHeightBasedEmission, mbHeightRampUniforms } from './MBModelRenderer';
import { parseGlb } from './MBDracoDecoder';

// mgl Tiled3dModelBucket PartNames — index = the partId in the feature attr.
export const PART_NAMES = ['', 'wall', 'door', 'roof', 'window', 'lamp', 'logo'];

/** mgl PartIndices.door — the part whose color drives the door lights. */
const DOOR_PART = 2;

/** GLB quantized grid extent (mgl tiled 3D models) — the y mirror axis. */
const GRID = 8192;

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
    roughness: number; // mgl overwrites the glTF factor (default 1)
    emissive: number;
    /** model-color alpha (mgl rmea[3] → final opacity multiplier). */
    alpha: number;
    /** model-opacity evaluated per part. */
    opacity: number;
    /** model-height-based-emissive-strength-multiplier ([1,1,1,1,0] default). */
    heightEmission: MBHeightBasedEmission;
}

function parseRgbaBytes(v: any): [number, number, number, number] | null {
    if (typeof v !== 'string') return null;
    // MBExpressionEngine formats colors as CSS hex (§550: the engine returns
    // e.g. "#f5e066" — the rgba() branch alone fell back to white and the
    // mix lerp washed the whole tile out).
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v.trim());
    if (hex) {
        const h = hex[1];
        const pair = (s: string) => parseInt(s, 16);
        if (h.length <= 4) {
            return [
                parseInt(h[0] + h[0], 16),
                parseInt(h[1] + h[1], 16),
                parseInt(h[2] + h[2], 16),
                h.length === 4 ? pair(h[3] + h[3]) / 255 : 1,
            ];
        }
        return [
            pair(h.slice(0, 2)),
            pair(h.slice(2, 4)),
            pair(h.slice(4, 6)),
            h.length === 8 ? pair(h.slice(6, 8)) / 255 : 1,
        ];
    }
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?/.exec(v);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
}

/** CSS keyword / hsl() fallback via THREE (e.g. "red", "hsl(0,0%,100%)"). */
function parseCssColor(v: string): [number, number, number, number] | null {
    const t = v.trim().toLowerCase();
    const isKeyword = /^[a-z]+$/.test(t)
        && (THREE.Color as any).NAMES?.[t] !== undefined;
    if (!isKeyword && !/^hsla?\(/.test(t)) return null;
    try {
        const c = new THREE.Color();
        c.setStyle(t, THREE.SRGBColorSpace);
        return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 1];
    } catch {
        return null;
    }
}

function evalPart(paint: any, zoom: number, part: string, brightness = 0): PartStyle {
    const props = part ? { part } : {};
    const evalRaw = (raw: any): any => {
        if (raw === undefined || raw === null) return undefined;
        try {
            if (typeof raw !== 'object') return raw;
            return MBExpressionEngine.evaluate(raw, {
                zoom,
                brightness,
                feature: { type: 'Point', properties: props, id: 0 },
            } as any);
        } catch {
            return undefined;
        }
    };
    const colorRaw = paint?.['model-color'];
    const colorEval = typeof colorRaw === 'object' && colorRaw !== null
        ? evalRaw(colorRaw) : colorRaw;
    const colorSrgb = parseRgbaBytes(colorEval)
        ?? (typeof colorEval === 'string' ? parseCssColor(colorEval) : null)
        ?? [255, 255, 255, 1];
    const num = (raw: any, dflt: number): number => {
        const v = evalRaw(raw);
        const n = Number(v);
        return Number.isFinite(n) ? n : dflt;
    };
    const mix = paint?.['model-color-mix-intensity'] === undefined ? 0
        : num(paint['model-color-mix-intensity'], 0);
    // mgl Tiled3dModelBucket.evaluate overwrites the per-part roughness with
    // the paint value unconditionally (style-spec default 1) — the glTF
    // material's own factor never survives for mesh-features tiles.
    const roughness = Math.min(Math.max(num(paint?.['model-roughness'], 1), 0), 1);
    const emissive = num(paint?.['model-emissive-strength'], 0);
    // [start, finish, startValue, finishValue, exponent] — mgl style-spec
    // default [1,1,1,1,0] degenerates to the constant ~1 branch.
    const rawH = paint?.['model-height-based-emissive-strength-multiplier'];
    const hArr = Array.isArray(rawH) && rawH.every((v: any) => typeof v === 'number')
        ? rawH : evalRaw(rawH);
    const heightEmission: MBHeightBasedEmission = Array.isArray(hArr) && hArr.length >= 5
        ? { start: Number(hArr[0]), finish: Number(hArr[1]),
            startValue: Number(hArr[2]), finishValue: Number(hArr[3]),
            exponent: Number(hArr[4]) }
        : { start: 1, finish: 1, startValue: 1, finishValue: 1, exponent: 0 };
    return {
        colorSrgb: [colorSrgb[0], colorSrgb[1], colorSrgb[2]],
        mix,
        roughness,
        emissive,
        alpha: colorSrgb[3] ?? 1,
        opacity: num(paint?.['model-opacity'], 1),
        heightEmission,
    };
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
 * mgl draw_model front-cutoff (model-front-cutoff paint, CPU per node):
 *   [start, range, opacity], enabled when opacity < 1.
 * cameraCollisionOpacity: camera inside the node AABB → fade out/in at 1/6
 * per frame. calculateFrontCutoffOpacity: pitch-gated (20°..40° ramp)
 * camera-space AABB bottom-edge cutoff with a range-scaled fade band.
 * Applied per frame over built tile groups; node factor multiplies each
 * part material's base opacity (mgl: u_opacity per node draw).
 */
export function applyModelFrontCutoff(
    groups: Iterable<THREE.Object3D>,
    paint: any,
    mv: any,
    evalVec: (key: string, dflt: [number, number, number]) => [number, number, number],
): void {
    const params = evalVec('model-front-cutoff', [0, 0, 1]);
    const finalOpacity = Math.min(Math.max(params[2], 0), 1);
    const enabled = finalOpacity < 1;
    const meshes: THREE.Mesh[] = [];
    for (const group of groups) {
        group.traverse((o: any) => {
            if (o.isMesh && o.userData?.__mbNodeBox) meshes.push(o as THREE.Mesh);
        });
    }
    if (!enabled) {
        for (const mesh of meshes) {
            const mat: any = mesh.material;
            if (mat && mesh.userData.__mbBaseOpacity !== undefined) {
                mat.opacity = mesh.userData.__mbBaseOpacity * (mesh.userData.__mbFarCutoff ?? 1);
            }
            mesh.userData.__mbCamColOp = undefined;
        }
        return;
    }
    const camera: any = mv?.camera;
    const pitch = Number(mv?.pitch ?? 0);
    if (!camera || pitch < 20) {
        for (const mesh of meshes) {
            const mat: any = mesh.material;
            if (mat && mesh.userData.__mbBaseOpacity !== undefined) {
                mat.opacity = mesh.userData.__mbBaseOpacity * (mesh.userData.__mbFarCutoff ?? 1);
            }
        }
        return;
    }
    // Screen pixels per meter at the target distance (mgl tr.pixelsPerMeter).
    const camPos = camera.position;
    const target: any = mv?.m_targetWorldPos ?? camPos;
    const dist = Math.max(camPos.distanceTo(target), 1);
    const canvasH = (mv?.getCanvasClientSize?.()?.height) ?? 512;
    const fovY = (camera.fov ?? 30) * Math.PI / 180;
    const pixelsPerMeter = (canvasH / 2) / (dist * Math.tan(fovY / 2));
    const fovScale = Math.tan(fovY / 2) * (camera.aspect ?? 1);
    const cutoffRange = 100 * pixelsPerMeter * Math.min(Math.max(params[1], 0), 1);
    const pitchT = Math.min(Math.max((pitch - 20) / 20, 0), 1);
    const camLocal = new THREE.Vector3();
    const corner = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();

    for (const mesh of meshes) {
        const box: THREE.Box3 = mesh.userData.__mbNodeBox;
        // cameraCollisionOpacity (±1/6 per frame) — camera inside the node box.
        let camCol: number = mesh.userData.__mbCamColOp ?? 1;
        try {
            mesh.updateWorldMatrix(true, false);
            camLocal.copy(camPos);
            mesh.parent!.worldToLocal(camLocal);
            const inside = camLocal.x > box.min.x && camLocal.x < box.max.x &&
                camLocal.y > box.min.y && camLocal.y < box.max.y &&
                camLocal.z < box.max.z;
            camCol = inside
                ? Math.max(camCol - 1 / 6, 0)
                : Math.min(camCol + 1 / 6, 1);
        } catch { camCol = 1; }
        mesh.userData.__mbCamColOp = camCol;

        // calculateFrontCutoffOpacity: transform the local box's 4 bottom
        // corners to CAMERA space via the last render's modelViewMatrix.
        let nodeOpacity = 1;
        try {
            mat4.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
            const zs = box.min.z;
            let minY = Infinity, maxY = -Infinity;
            const pts: THREE.Vector3[] = [];
            for (const [cx, cy] of [[box.min.x, box.min.y], [box.max.x, box.min.y],
                [box.max.x, box.max.y], [box.min.x, box.max.y]]) {
                corner.set(cx, cy, zs).applyMatrix4(mat4);
                pts.push(corner.clone());
                minY = Math.min(minY, corner.y);
                maxY = Math.max(maxY, corner.y);
            }
            const t0 = Math.min(Math.max(params[0], 0), 1);
            const cutoffStartY = minY + (maxY - minY) * t0;
            const cutoffStartZ = Math.abs(pts[0].z);
            const yMinLimit = -cutoffStartZ * fovScale;
            if (cutoffRange === 0) {
                nodeOpacity = cutoffStartY < yMinLimit ? finalOpacity : 1;
            } else {
                const cutoffFactor = (yMinLimit - cutoffStartY) / cutoffRange;
                const lerpFactor = Math.min(Math.max(cutoffFactor, 0), 1);
                const op = Math.min(Math.max(1 + (finalOpacity - 1) * lerpFactor, finalOpacity), 1);
                nodeOpacity = 1 + (op - 1) * pitchT;
            }
        } catch { nodeOpacity = 1; }

        const factor = camCol * nodeOpacity * (mesh.userData.__mbFarCutoff ?? 1);
        const mat: any = mesh.material;
        if (mat && mesh.userData.__mbBaseOpacity !== undefined) {
            const base = mesh.userData.__mbBaseOpacity;
            const opacity = base * factor;
            mat.opacity = opacity;
            mat.transparent = opacity < 1 || mat.userData.__mbForceTransparent === true;
        }
    }
}

/**
 * mgl getCutoffParams + calculateFarCutoffOpacity (src/render/cutoff.ts,
 * draw_model.ts): `model-cutoff-fade-range` fades nodes that are CLOSER than
 * an automatic far-cutoff line before the LOD tile cover switches. The line
 * sits at 1.4× camera-to-center distance scaled by a half-rate exponential
 * (2^(dz·0.85) above the sources' min zoom), with a 1.3×screenHeight fade
 * band, ramped in over a 15°..30° pitch window. Per node: linearized anchor
 * depth → opacity = clamp((linDepth − start)/(fade − start)).
 * Stores the factor per mesh (__mbFarCutoff) — applyModelFrontCutoff
 * multiplies it into the final material opacity.
 */
export function applyModelFarCutoff(
    groups: Iterable<THREE.Object3D>,
    mv: any,
    zoom: number,
    minCutoffZoom: number,
    evalNum: (key: string, dflt: number) => number,
): void {
    const fadeRange = evalNum('model-cutoff-fade-range', 0);
    const reset = (): void => {
        for (const group of groups) {
            group.traverse((o: any) => {
                if (o.isMesh) o.userData.__mbFarCutoff = undefined;
            });
        }
    };
    if (!(fadeRange > 0)) return reset();
    const camera: any = mv?.camera;
    if (!camera) return reset();
    const pitch = Number(mv?.pitch ?? 0);
    const activationThreshold = 30;
    if (pitch < activationThreshold - 15) return reset();
    const near = camera.near ?? 1;
    const far = camera.far ?? near * 10;
    const zRange = far - near;
    if (zRange <= 0) return reset();
    const camPos = camera.position;
    const target: any = mv?.m_targetWorldPos ?? camPos;
    const camToCenter = Math.max(camPos.distanceTo(target), 1);
    const height = (mv?.getCanvasClientSize?.()?.height) ?? 512;
    const fadeRangePixels = fadeRange * height * 1.3;
    const zoomScale = Math.pow(2, Math.max(zoom - minCutoffZoom, 0) * 0.85);
    const cutoffDistance = camToCenter * 1.4 * zoomScale;
    const t = Math.min(Math.max((pitch - (activationThreshold - 15)) / 15, 0), 1);
    const activation = t * t * (3 - 2 * t); // smoothstep
    // lerp(farZ + fadeRangePixels, cutoffDistance, activation)
    const eff = (far + fadeRangePixels) + (cutoffDistance - (far + fadeRangePixels)) * activation;
    const clamped = Math.min(fadeRangePixels, eff - near);
    const relStart = (eff - near) / zRange;
    const relFade = (eff - clamped - near) / zRange;
    const view = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (const group of groups) {
        group.traverse((o: any) => {
            if (!o.isMesh) return;
            try {
                o.updateWorldMatrix(true, false);
                p.setFromMatrixPosition(o.matrixWorld).applyMatrix4(
                    view.copy(camera.matrixWorldInverse));
                const linearDepth = (-p.z - near) / zRange;
                o.userData.__mbFarCutoff = relFade === relStart ? 1
                    : Math.min(Math.max((linearDepth - relStart) / (relFade - relStart), 0), 1);
            } catch { o.userData.__mbFarCutoff = undefined; }
        });
    }
}

/**
 * mgl decodeLights (model_loader.ts): node `extras.lights` base64 → area
 * lights. 24 bytes per light: two uint16 (height, elevation — /30) + a
 * uint16 depth (/100 at u16 index 10) + three float32 endpoints (x0,y0,x1,y1
 * tile coordinates).
 */
function decodeLights(base64: string): Array<{
    pos: [number, number, number]; normal: [number, number, number];
    width: number; height: number; depth: number;
}> {
    if (!base64.length) return [];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const lightCount = Math.floor(bytes.length / 24);
    const u16 = new Uint16Array(bytes.buffer);
    const f32 = new Float32Array(bytes.buffer);
    const lights: Array<{ pos: [number, number, number]; normal: [number, number, number]; width: number; height: number; depth: number; }> = [];
    for (let i = 0; i < lightCount; i++) {
        const height = u16[i * 12] / 30;
        const elevation = u16[i * 12 + 1] / 30;
        const depth = u16[i * 12 + 10] / 100;
        const x0 = f32[i * 6 + 1];
        const y0 = f32[i * 6 + 2];
        const x1 = f32[i * 6 + 3];
        const y1 = f32[i * 6 + 4];
        // Corrupt/out-of-grid endpoints would explode the extrusion quads
        // across the whole map — skip instead (door lights are sub-meter
        // features inside the 8192 grid).
        if (![x0, y0, x1, y1, height, elevation, depth].every(
            (v) => Number.isFinite(v) && Math.abs(v) <= GRID * 2)) {
            continue;
        }
        const dx = x1 - x0;
        const dy = y1 - y0;
        const width = Math.hypot(dx, dy);
        if (width === 0 || depth === 0) continue;
        const normal: [number, number, number] = [dy / width, -dx / width, 0];
        const pos: [number, number, number] = [x0 + dx * 0.5, y0 + dy * 0.5, elevation];
        lights.push({ pos, normal, width, height, depth });
    }
    return lights;
}

/**
 * mgl calculateLightsMesh / createLightsMesh: 10 vertices + 4 triangles per
 * door light — the door plane plus a ground/face extrusion whose per-vertex
 * `color_4f` encodes the falloff frame. Coordinates come out in the GLB grid
 * (y south); vertices are y-mirrored like the regular tile geometry.
 */
function buildLightsGeometry(
    lights: Array<{ pos: [number, number, number]; normal: [number, number, number]; width: number; height: number; depth: number; }>,
    zScale: number,
): { positions: Float32Array; c4f: Float32Array; indices: Uint32Array } | null {
    const positions = new Float32Array(lights.length * 10 * 3);
    const c4f = new Float32Array(lights.length * 10 * 4);
    const indices = new Uint32Array(lights.length * 12);
    const MY = (y: number) => GRID - y; // GLB grid y-south → engine y-north
    let v = 0, t = 0;
    for (const light of lights) {
        const fallOff = Math.min(10, Math.max(4, 1.3 * light.height)) * zScale;
        const tangent = [-light.normal[1], light.normal[0], 0];
        const horizontalSpread = Math.min(0.29, 0.1 * light.width / light.depth);
        const width = light.width - 2 * light.depth * zScale * (horizontalSpread + 0.01);
        const halfWidth = width / fallOff / 2.0;
        const v1: [number, number, number] = [
            light.pos[0] + tangent[0] * width / 2,
            light.pos[1] + tangent[1] * width / 2,
            light.pos[2],
        ];
        const v2: [number, number, number] = [
            light.pos[0] - tangent[0] * width / 2,
            light.pos[1] - tangent[1] * width / 2,
            light.pos[2],
        ];
        const v0: [number, number, number] = [v1[0], v1[1], v1[2] + light.height];
        const v3: [number, number, number] = [v2[0], v2[1], v2[2] + light.height];
        const push = (p: [number, number, number], x: number, y: number, z: number, w: number) => {
            positions[v * 3] = p[0];
            positions[v * 3 + 1] = MY(p[1]);
            positions[v * 3 + 2] = p[2];
            c4f[v * 4] = x; c4f[v * 4 + 1] = y; c4f[v * 4 + 2] = z; c4f[v * 4 + 3] = w;
            v++;
        };
        const v1e: [number, number, number] = [
            v1[0] + (light.normal[0] + tangent[0] * horizontalSpread) * fallOff,
            v1[1] + (light.normal[1] + tangent[1] * horizontalSpread) * fallOff,
            v1[2],
        ];
        const v2e: [number, number, number] = [
            v2[0] + (light.normal[0] - tangent[0] * horizontalSpread) * fallOff,
            v2[1] + (light.normal[1] - tangent[1] * horizontalSpread) * fallOff,
            v2[2],
        ];
        const v1b: [number, number, number] = [v1[0], v1[1], v1[2] + 0.1];
        const v2b: [number, number, number] = [v2[0], v2[1], v2[2] + 0.1];
        push(v1e, -halfWidth - horizontalSpread, -1, halfWidth, 0.8);
        push(v2e, halfWidth + horizontalSpread, -1, halfWidth, 0.8);
        push(v1b, -halfWidth, 0, halfWidth, 1.3);
        push(v2b, halfWidth, 0, halfWidth, 1.3);
        push(v0, halfWidth + horizontalSpread, -0.8, halfWidth, 0.7);
        push(v3, halfWidth + horizontalSpread, -0.8, halfWidth, 0.7);
        push(v1b, 0, 0, halfWidth, 1.3);
        push(v2b, 0, 0, halfWidth, 1.3);
        push(v1e, halfWidth + horizontalSpread, -1.2, halfWidth, 0.8);
        push(v2e, halfWidth + horizontalSpread, -1.2, halfWidth, 0.8);
        indices[t++] = v - 10 + 6; indices[t++] = v - 10 + 4; indices[t++] = v - 10 + 8;
        indices[t++] = v - 10 + 7; indices[t++] = v - 10 + 9; indices[t++] = v - 10 + 5;
        indices[t++] = v - 10 + 0; indices[t++] = v - 10 + 1; indices[t++] = v - 10 + 2;
        indices[t++] = v - 10 + 1; indices[t++] = v - 10 + 3; indices[t++] = v - 10 + 2;
    }
    if (v === 0) return null;
    return { positions, c4f, indices };
}

/**
 * The emissive door-light quads of a landmark node (mgl renders them in the
 * same model draw, tinted by the DOOR part's color_mix with a distance
 * falloff from the color_4f frame — model.fragment.glsl
 * HAS_ATTRIBUTE_a_color_4f branch).
 */
function buildNodeLightsMesh(
    lightsBase64: string,
    doorColorBytes: [number, number, number],
    doorEmissive: number,
    zScale: number,
): THREE.Mesh | null {
    try {
        const geo = buildLightsGeometry(decodeLights(lightsBase64), zScale);
        if (!geo) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
        g.setAttribute('mbC4f', new THREE.BufferAttribute(geo.c4f, 4));
        g.setIndex(new THREE.BufferAttribute(geo.indices, 1));
        const mat: any = new THREE.MeshBasicMaterial({
            color: new THREE.Color(
                srgbToLinear(doorColorBytes[0] / 255),
                srgbToLinear(doorColorBytes[1] / 255),
                srgbToLinear(doorColorBytes[2] / 255)),
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        mat.onBeforeCompile = (shader: any) => {
            shader.uniforms.uMBLightsE = { value: doorEmissive };
            // Indirect-update handle (refreshMeshFeatures).
            (mat as any).__mbLightsU = shader.uniforms.uMBLightsE;
            shader.vertexShader = shader.vertexShader
                .replace('void main() {',
                    `attribute vec4 mbC4f;
                     varying vec4 vMbC4f;
                     void main() {
                         vMbC4f = mbC4f;`)
                // three expands color_vertex etc.; keep them intact.
                .replace('#include <begin_vertex>',
                    '#include <begin_vertex>');
            shader.fragmentShader = shader.fragmentShader
                .replace('void main() {',
                    `uniform float uMBLightsE;
                     varying vec4 vMbC4f;
                     void main() {`)
                .replace('#include <opaque_fragment>',
                    `#include <opaque_fragment>
                     {
                         // mgl model.fragment.glsl light-geometry falloff.
                         float mbD = length(vec2(1.3 * max(0.0, abs(vMbC4f.x) - vMbC4f.z), vMbC4f.y));
                         mbD += mix(0.5, 0.0, clamp(uMBLightsE - 1.0, 0.0, 1.0));
                         gl_FragColor.a *= clamp(1.0 - mbD * mbD, 0.0, 1.0);
                         if (gl_FragColor.a <= 0.0) discard;
                     }`);
        };
        const mesh = new THREE.Mesh(g, mat);
        (mat as any).__mbIsLights = true;
        mesh.renderOrder = 11;
        mesh.frustumCulled = false;
        return mesh;
    } catch {
        return null;
    }
}

/**
 * mgl style.ts getBrightness: the `measure-light` `brightness` global —
 * relative luminance of the 3D lights configuration, averaged directional
 * (with the polar-angle falloff) and ambient. lighting3DState colors are
 * already linear (sRGB^2.2 · intensity), so the luminance weights apply
 * directly; polarIntensity = 1 − polar°/90.
 */
export function mglMeasureLightBrightness(dataSource: any): number {
    try {
        const ls = dataSource?.m_environment?.lighting3DState;
        if (!ls) return 0;
        const lum = (c: number[]) =>
            0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const polarDeg = Math.acos(Math.min(Math.max(ls.dir[2], -1), 1)) * 180 / Math.PI;
        const polarIntensity = 1 - Math.min(Math.max(polarDeg, 0), 90) / 90;
        return (lum(ls.directionalColorLinear) * polarIntensity + lum(ls.ambientColorLinear)) / 2;
    } catch {
        return 0;
    }
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
        const brightness = mglMeasureLightBrightness(dataSource);
        const parts = PART_NAMES.map(name => evalPart(paint, zoom, name, brightness));
        const meshes: THREE.Mesh[] = [];
        root.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry?.getAttribute?.(FEATURE_ATTR)) meshes.push(mesh);
        });
        // Indirect-update bookkeeping: the split sources and the featureless
        // meshes, so runtime setLights/setZoom (measure-light-dependent part
        // paint) can re-derive the styling without a re-decode.
        root.userData.__mbFeatSources = [];
        root.userData.__mbFeatFeatureless = [];
        for (const mesh of meshes) {
            splitByPart(mesh, parts, root, dataSource);
            if (mesh.userData.__mbFeatSplit) {
                root.userData.__mbFeatSources.push(mesh);
            }
        }
        // Feature-less meshes of a features tile: mgl evaluates the layer's
        // emissive with no part property (the part-0 slot).
        root.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && !mesh.geometry.getAttribute(FEATURE_ATTR) && !mesh.userData.__mbPart) {
                applyMglModelLighting(dataSource, mesh, parts[0].emissive);
                root.userData.__mbFeatFeatureless.push(mesh);
            }
        });
        root.userData.__mbFeatState = { zoom, brightness };
    } catch { /* styling must never break tile loading */ }
}

/**
 * Indirect part-styling update (runtime `setLights` / `setZoom`): the part
 * paint is evaluated with the CURRENT measure-light brightness and zoom, and
 * the already-built split meshes are re-derived in place — vertex mix colors,
 * per-part roughness/alpha/opacity and the emissive-strength uniform. No-op
 * when neither zoom nor brightness moved since the last application. Split
 * topology (which triangles belong to which part) never changes, so the
 * per-part index buffers are reused.
 */
export function refreshMeshFeatures(
    root: THREE.Object3D,
    paint: any,
    zoom: number,
    dataSource: any,
): void {
    try {
        const prev = root.userData.__mbFeatState as
            { zoom: number; brightness: number } | undefined;
        if (!prev) return; // never styled (or a non-features tile)
        const brightness = mglMeasureLightBrightness(dataSource);
        if (Math.abs(prev.zoom - zoom) < 1e-9
            && Math.abs(prev.brightness - brightness) < 1e-9) return;
        root.userData.__mbFeatState = { zoom, brightness };
        const parts = PART_NAMES.map(name => evalPart(paint, zoom, name, brightness));
        const sources = root.userData.__mbFeatSources as THREE.Mesh[];
        for (const mesh of sources) {
            refreshSplit(mesh, parts);
        }
        for (const mesh of root.userData.__mbFeatFeatureless as THREE.Mesh[]) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats as any[]) {
                const u = mat?.userData?.__mbLightU;
                if (u?.emis) u.emis.value = parts[0].emissive;
            }
        }
    } catch { /* styling must never break the frame */ }
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
    // First mixed 4444 color per part — the door color that drives the node's
    // light geometry (mgl buildMeshFeatureArray doorLight branch).
    const partFirstColor = new Map<number, [number, number, number]>();
    for (let i = 0; i < vertCount; i++) {
        const u32 = (u16[i * 2] | (u16[i * 2 + 1] << 16)) >>> 0;
        const rawPart = u32 & 0xf;
        const partId = rawPart < parts.length ? rawPart : 0;
        partOf[i] = partId;
        const style = parts[partId];
        let [r, g, b] = expand4444((u32 >>> 16) & 0xffff);
        if (!partFirstColor.has(partId)) partFirstColor.set(partId, [r, g, b]);
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
    // The height ramp maps the mesh-local z through the WHOLE mesh's z range
    // (mgl computePartPbrTable receives mesh.aabb before the part split).
    geometry.computeBoundingBox();
    const bboxZMin = geometry.boundingBox?.min.z ?? 0;
    const bboxZMax = geometry.boundingBox?.max.z ?? 0;
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
        mat.roughness = style.roughness;
        // mgl never styles metallic (Tiled3dModelFeature default table:
        // window=1, every other part=0) and the a_pbr decode replaces the
        // glTF factor with it.
        mat.metalness = partId === 4 ? 1 : 0;
        // Final opacity chain (mgl: baseColorFactor.a × part alpha ×
        // model-opacity — u_opacity uniform).
        const opacity = (mat.opacity ?? 1) * style.alpha * style.opacity;
        if (opacity < 1) {
            mat.transparent = true;
            mat.opacity = opacity;
            mat.depthWrite = false;
        }
        const sub = new THREE.Mesh(subGeo, mat);
        sub.position.copy(mesh.position);
        sub.quaternion.copy(mesh.quaternion);
        sub.scale.copy(mesh.scale);
        sub.renderOrder = mesh.renderOrder;
        sub.frustumCulled = mesh.frustumCulled;
        sub.userData.__mbPart = partId;
        // Front-cutoff / opacity bookkeeping propagates to the split meshes
        // (the per-frame applyModelFrontCutoff walks these).
        sub.userData.__mbNodeBox = mesh.userData?.__mbNodeBox;
        sub.userData.__mbAnchor = mesh.userData?.__mbAnchor;
        sub.userData.__mbBaseOpacity = (mat.opacity ?? 1);
        // Base opacity BEFORE the part alpha/opacity chain (refresh re-derives).
        sub.userData.__mbMatBaseOpacity = (mat.opacity ?? 1);
        if (mat.transparent) (mat.userData ??= {}).__mbForceTransparent = true;
        const hr = mbHeightRampUniforms(style.heightEmission, bboxZMin, bboxZMax);
        applyMglModelLighting(dataSource, sub, style.emissive, undefined, hr);
        sub.userData.__mbHrParams = hr;
        subMeshes.push(sub);
    }

    parent.add(...subMeshes);
    parent.remove(mesh);
    // Door lights (mgl node.lights → lightMeshIndex mesh tinted by the door
    // color_mix). The lights ride the same node as the features mesh.
    const lightsBase64 = mesh.userData?.__mbLights;
    let lightsMesh: THREE.Mesh | null = null;
    if (lightsBase64 && partFirstColor.has(DOOR_PART)) {
        const doorColor = partFirstColor.get(DOOR_PART)!;
        lightsMesh = buildNodeLightsMesh(
            lightsBase64, doorColor, parts[DOOR_PART].emissive,
            mesh.userData?.__mbZScale ?? 5);
        if (lightsMesh) {
            lightsMesh.userData.__mbNodeId = mesh.userData?.__mbNodeId;
            parent.add(lightsMesh);
        }
    }
    // Indirect-update bookkeeping (see refreshMeshFeatures): everything a
    // re-application needs — the detached source mesh keeps its geometry
    // (sub-meshes share the attribute buffers, only indices are copied).
    mesh.userData.__mbFeatSplit = {
        parent,
        subMeshes,
        lightsMesh,
        partFirstColor,
        bboxZMin,
        bboxZMax,
        colorAttr: sharedColor,
    };
}

/**
 * Re-derive one split source mesh's styling under new parts (indirect
 * update): vertex mix colors, per-sub roughness/alpha/opacity/emissive
 * uniforms/height-ramp and the door-light tint. The part→triangle topology
 * is reused unchanged.
 */
function refreshSplit(mesh: THREE.Mesh, parts: PartStyle[]): void {
    const split = mesh.userData?.__mbFeatSplit as {
        parent: THREE.Object3D; subMeshes: THREE.Mesh[];
        lightsMesh: THREE.Mesh | null;
        partFirstColor: Map<number, [number, number, number]>;
        bboxZMin: number; bboxZMax: number;
        colorAttr: THREE.BufferAttribute;
    } | undefined;
    if (!split) return;
    const geometry = mesh.geometry;
    const feature = geometry.getAttribute(FEATURE_ATTR) as THREE.BufferAttribute;
    const colorAttr = split.colorAttr;
    if (!feature || !colorAttr) return;
    const u16 = feature.array as Uint16Array;
    const vertCount = feature.count;
    const colors = colorAttr.array as Float32Array;
    const partFirstColor = new Map<number, [number, number, number]>();
    for (let i = 0; i < vertCount; i++) {
        const u32 = (u16[i * 2] | (u16[i * 2 + 1] << 16)) >>> 0;
        const rawPart = u32 & 0xf;
        const partId = rawPart < parts.length ? rawPart : 0;
        const style = parts[partId] ?? parts[0];
        let [r, g, b] = expand4444((u32 >>> 16) & 0xffff);
        if (!partFirstColor.has(partId)) partFirstColor.set(partId, [r, g, b]);
        if (style.mix > 0) {
            r = Math.round(r + (style.colorSrgb[0] - r) * style.mix);
            g = Math.round(g + (style.colorSrgb[1] - g) * style.mix);
            b = Math.round(b + (style.colorSrgb[2] - b) * style.mix);
        }
        colors[i * 3] = srgbToLinear(r / 255);
        colors[i * 3 + 1] = srgbToLinear(g / 255);
        colors[i * 3 + 2] = srgbToLinear(b / 255);
    }
    colorAttr.needsUpdate = true;
    for (const sub of split.subMeshes) {
        const partId: number = sub.userData.__mbPart ?? 0;
        const style = parts[partId] ?? parts[0];
        const mat: any = sub.material;
        mat.roughness = style.roughness;
        const base: number = sub.userData.__mbMatBaseOpacity ?? 1;
        const opacity = base * style.alpha * style.opacity;
        mat.opacity = opacity;
        mat.transparent = opacity < 1 || !!((mat.userData ?? {}).__mbForceTransparent);
        mat.depthWrite = opacity >= 1 && !mat.transparent;
        sub.userData.__mbBaseOpacity = opacity;
        const u = mat.userData?.__mbLightU;
        if (u?.emis) u.emis.value = style.emissive;
        const hr = mbHeightRampUniforms(style.heightEmission, split.bboxZMin, split.bboxZMax);
        if (u?.hbs) u.hbs.value = [hr.b0, hr.b1, hr.power, hr.start];
        if (u?.hbsRange) u.hbsRange.value = hr.range;
        sub.userData.__mbHrParams = hr;
    }
    if (split.lightsMesh) {
        const doorColor = partFirstColor.get(DOOR_PART);
        const mat: any = split.lightsMesh.material;
        if (doorColor && mat?.color) {
            mat.color.setRGB(
                srgbToLinear(doorColor[0] / 255),
                srgbToLinear(doorColor[1] / 255),
                srgbToLinear(doorColor[2] / 255));
        }
        const u = mat?.userData?.__mbLightsU;
        if (u) u.value = parts[DOOR_PART]?.emissive ?? u.value;
    }
}
