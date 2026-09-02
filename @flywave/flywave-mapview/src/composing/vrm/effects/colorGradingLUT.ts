/* Copyright (C) 2026 flywave.gl contributors */
// @ts-nocheck

/**
 * 3D LUT color grading (TSL, WebGPU/WebGL2).
 *
 * Applies a film-look 3D lookup table to the final tone-mapped image — the
 * port of navara's ColorGradingLUT (postprocessing LUT3DEffect semantics)
 * onto the engine's TSL node graph. The lookup happens in output color
 * space: the LUT maps the display-referred input color directly to the
 * graded color (identity-domain remap + hardware trilinear filtering).
 *
 * The texture lives in a single {@link ColorGradingLutController} reused
 * across node-graph rebuilds: swapping `textureNode.value` replaces the LUT
 * without touching the graph; only the `enabled` transition rebuilds.
 *
 * .cube/.3dl parsing is done here instead of three/addons LUTCubeLoader /
 * LUT3dlLoader: system rule forbids `import ... from "three"` and those
 * loaders pull the WebGL build, which in the examples import map is a
 * *separate module instance* from `three/webgpu` — textures would come from
 * a different class realm than the renderer.
 */

import * as THREE from "three/webgpu";
import { Fn, sRGBTransferEOTF, sRGBTransferOETF, texture3D, uniform, vec4 } from "three/tsl";

const NEUTRAL_LUT_SIZE = 8;

type LoadedLut = { size: number; texture3D: THREE.Data3DTexture };

/** Raw cube table: `size³` RGBA8 texels, r-fastest / b-slowest order. */
type LutTable = { size: number; data: Uint8Array };

/** RGBA Uint8 ramp: identity LUT — every output color maps to itself. */
function createNeutralLutTexture(size = NEUTRAL_LUT_SIZE): THREE.Data3DTexture {
    const data = new Uint8Array(size * size * size * 4);
    for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
            for (let r = 0; r < size; r++) {
                const i = (b * size * size + g * size + r) * 4;
                data[i] = Math.round((r / (size - 1)) * 255);
                data[i + 1] = Math.round((g / (size - 1)) * 255);
                data[i + 2] = Math.round((b / (size - 1)) * 255);
                data[i + 3] = 255;
            }
        }
    }
    const texture = new THREE.Data3DTexture(data, size, size, size);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

function lutExtension(url: string): string {
    const path = url.split(/[?#]/)[0];
    return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

async function fetchLutText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch LUT ${url}: ${response.status}`);
    }
    return response.text();
}

/**
 * Parses the .cube format (Adobe Cube LUT spec). Data points are listed
 * red-fastest / blue-slowest, matching the texture's texel order directly;
 * channels are scaled to bytes by truncation (same coercion as
 * three/addons LUTCubeLoader, so tables stay byte-identical). DOMAIN_MIN/
 * MAX are not honored — the identity-domain lookup assumes [0,1], which all
 * built-in presets use.
 */
function parseCubeLut(text: string): LutTable {
    const regExpSize = /LUT_3D_SIZE +(\d+)/;
    const regExpDataPoints = /^([\d.e+-]+) +([\d.e+-]+) +([\d.e+-]+) *$/gm;

    const sizeMatch = regExpSize.exec(text);
    if (sizeMatch === null) {
        throw new Error("cube LUT: missing LUT_3D_SIZE");
    }
    const size = Number(sizeMatch[1]);
    const data = new Uint8Array(size ** 3 * 4);
    let i = 0;
    let match;
    while ((match = regExpDataPoints.exec(text)) !== null) {
        data[i++] = Number(match[1]) * 255;
        data[i++] = Number(match[2]) * 255;
        data[i++] = Number(match[3]) * 255;
        data[i++] = 255;
    }
    if (i !== data.length) {
        throw new Error(`cube LUT: expected ${size ** 3} data points, got ${i / 4}`);
    }
    return { size, data };
}

/**
 * Parses the .3dl format (Autodesk Lustre). Data points are listed
 * blue-fastest / red-slowest — the reverse of the texture's texel order —
 * and scaled by the file's bit depth (`2^ceil(log2(maxValue))`), so the
 * table is remapped into r-fastest order and normalized to bytes.
 */
function parse3dlLut(text: string): LutTable {
    const regExpGridInfo = /^[\d ]+$/m;
    const regExpDataPoints = /^([\d.e+-]+) +([\d.e+-]+) +([\d.e+-]+) *$/gm;

    const gridMatch = regExpGridInfo.exec(text);
    if (gridMatch === null) {
        throw new Error("3dl LUT: missing grid information");
    }
    const gridLines = gridMatch[0].trim().split(/\s+/g).map(Number);
    const gridStep = gridLines[1] - gridLines[0];
    const size = gridLines.length;
    for (let i = 1; i < gridLines.length; ++i) {
        if (gridStep !== gridLines[i] - gridLines[i - 1]) {
            throw new Error("3dl LUT: inconsistent grid size");
        }
    }

    const sizeSq = size ** 2;
    const floats = new Float32Array(size ** 3 * 4);
    let maxValue = 0;
    let index = 0;
    let match;
    while ((match = regExpDataPoints.exec(text)) !== null) {
        const r = Number(match[1]);
        const g = Number(match[2]);
        const b = Number(match[3]);
        maxValue = Math.max(maxValue, r, g, b);
        // file order: b grows first, then g, then r
        const bLayer = index % size;
        const gLayer = Math.floor(index / size) % size;
        const rLayer = Math.floor(index / sizeSq) % size;
        const d4 = (bLayer * sizeSq + gLayer * size + rLayer) * 4;
        floats[d4] = r;
        floats[d4 + 1] = g;
        floats[d4 + 2] = b;
        ++index;
    }
    if (index !== size ** 3) {
        throw new Error(`3dl LUT: expected ${size ** 3} data points, got ${index}`);
    }

    const bits = Math.ceil(Math.log2(maxValue));
    const maxBitValue = 2 ** bits;
    const data = new Uint8Array(size ** 3 * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (floats[i] / maxBitValue) * 255;
        data[i + 1] = (floats[i + 1] / maxBitValue) * 255;
        data[i + 2] = (floats[i + 2] / maxBitValue) * 255;
        data[i + 3] = 255;
    }
    return { size, data };
}

/**
 * Decodes a flattened 2D LUT image (PNG/JPG) into a LutTable.
 *
 * 2D LUT images come in two encodings that both flatten the r-fastest /
 * b-slowest cube table into row-major pixel order:
 * - strip: width or height = size, the other = size² (e.g. 64 × 4096)
 * - grid (Hald-style, e.g. RawTherapee exports): square, width = height =
 *   size × k, size³ = width × height
 *
 * three's LUTImageLoader only handles strips and misreads grid images as a
 * 1728³ cube (GPUOutOfMemoryError), so the reorder is done here instead.
 * `colorSpaceConversion: "none"` skips ICC conversion — LUT tables must be
 * read as raw bytes.
 */
async function loadLutImageTable(url: string): Promise<LutTable> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch LUT image ${url}: ${response.status}`);
    }
    const bitmap = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: "none"
    });
    try {
        const width = bitmap.width;
        const height = bitmap.height;
        const size = Math.round((width * height) ** (1 / 3));
        if (size ** 3 !== width * height) {
            throw new Error(
                `Invalid LUT image dimensions ${width}x${height}: pixel count is not a perfect cube`
            );
        }
        const context = new OffscreenCanvas(width, height).getContext("2d");
        if (context === null) {
            throw new Error("Failed to create 2D context for LUT image decoding");
        }
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        const data = new Uint8Array(size * size * size * 4);
        // vertical strip (w=size) and Hald grid (w=h) flatten the table
        // r-fastest — the flat pixel order is the texel order itself. The
        // horizontal strip (w=size²) lists blue fastest instead.
        const horizontal = width === size * size && height === size;
        for (let i = 0; i < size * size * size; i++) {
            const r = i % size;
            const g = Math.floor(i / size) % size;
            const b = Math.floor(i / (size * size));
            const src = (horizontal ? b * size * size + g * size + r : i) * 4;
            const dst = i * 4;
            data[dst] = pixels[src];
            data[dst + 1] = pixels[src + 1];
            data[dst + 2] = pixels[src + 2];
            data[dst + 3] = 255;
        }
        return { size, data };
    } finally {
        bitmap.close();
    }
}

async function loadLutTable(url: string): Promise<LutTable> {
    switch (lutExtension(url)) {
        case "cube":
            return parseCubeLut(await fetchLutText(url));
        case "3dl":
            return parse3dlLut(await fetchLutText(url));
        default:
            return loadLutImageTable(url);
    }
}

function makeLutTexture(table: LutTable): THREE.Data3DTexture {
    const texture = new THREE.Data3DTexture(table.data, table.size, table.size, table.size);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.needsUpdate = true;
    return texture;
}

/** Loads .cube / .3dl / image-strip LUTs into a filterable Data3DTexture. */
async function loadLutFile(url: string): Promise<LoadedLut> {
    const table = await loadLutTable(url);
    return { size: table.size, texture3D: makeLutTexture(table) };
}

const lutCache = new Map<string, Promise<LoadedLut>>();

function loadLutCached(url: string): Promise<LoadedLut> {
    let cached = lutCache.get(url);
    if (cached === undefined) {
        cached = loadLutFile(url).catch(error => {
            lutCache.delete(url);
            throw error;
        });
        lutCache.set(url, cached);
    }
    return cached;
}

/** Applies the controller's LUT to `inputNode` with the given blend opacity. */
export const colorGradingLut = (
    inputNode: unknown,
    controller: ColorGradingLutController,
    opacity: number
) => {
    const scale = controller.domainScale;
    const offset = controller.domainOffset;
    const blend = controller.opacity;
    blend.value = opacity;
    return Fn(() => {
        const color = inputNode.rgb.toVar();
        // LUT files are display-referred (sRGB domain), but the chain at this
        // point is still in the working (linear) space — the pipeline applies
        // the sRGB output transform only after dithering. Convert in and out
        // around the lookup (same semantics as postprocessing's LUT3DEffect),
        // otherwise midtones sample the wrong table region and colors shift.
        const uvw = sRGBTransferOETF(color).mul(scale).add(offset).toVar();
        const graded = sRGBTransferEOTF(controller.textureNode.sample(uvw).rgb);
        return vec4(color.mix(graded, blend), 1);
    })();
};

/**
 * Owns the LUT texture slot shared by every node-graph rebuild. The
 * texture node is created once with a neutral LUT and only its `.value`
 * (plus domain uniforms) changes when a new LUT finishes loading, so
 * switching LUTs never forces a pipeline rebuild by itself.
 */
export class ColorGradingLutController {
    /** Persistent 3D texture node sampled inside the grading Fn. */
    readonly textureNode: ReturnType<typeof texture3D>;

    /** `vec3((N-1)/N)` — uniform so LUTs of different sizes can be swapped. */
    readonly domainScale = uniform(new THREE.Vector3(1, 1, 1));
    /** `vec3(0.5/N)` texel-center offset matching {@link domainScale}. */
    readonly domainOffset = uniform(new THREE.Vector3(0, 0, 0));
    /** Blend factor uniform; `.value` is refreshed on every graph build. */
    readonly opacity = uniform(1);

    private m_loadedUrl: string | null = null;
    private m_loadToken = 0;

    constructor() {
        this.textureNode = texture3D(createNeutralLutTexture());
    }

    /** Currently loaded LUT URL, or null while the neutral LUT is active. */
    get loadedUrl(): string | null {
        return this.m_loadedUrl;
    }

    /**
     * Asynchronously swaps in the LUT at `url`. Concurrent calls race-safe:
     * only the latest call applies its result. Neutral LUT (unchanged image)
     * until the load resolves. Returns false when `url` was already loaded.
     */
    async setLut(url: string): Promise<boolean> {
        if (url === this.m_loadedUrl) return false;
        this.m_loadedUrl = url;
        if (url === "") return true;
        const token = ++this.m_loadToken;
        const { size, texture3D: tex } = await loadLutCached(url);
        if (token !== this.m_loadToken) return true; // superseded
        tex.generateMipmaps = false;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        this.textureNode.value = tex;
        const cell = 1 / size;
        this.domainScale.value.setScalar(1 - cell);
        this.domainOffset.value.setScalar(cell * 0.5);
        return true;
    }

    dispose(): void {
        const value = this.textureNode.value as THREE.Data3DTexture;
        value.dispose();
    }
}
