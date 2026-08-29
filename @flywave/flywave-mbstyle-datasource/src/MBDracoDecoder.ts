/**
 * §547: main-thread Draco decoding for batched-model GLB tiles.
 *
 * DRACOLoader spawns its worker from a Blob URL, which the karma test page
 * blocks — GLTFLoader.parse then hangs silently with no error callback
 * (§542–§546 terminal state). mgl decodes Draco directly on the parsing
 * thread via the raw emscripten module (3d-style/util/loaders.ts
 * `loadDracoMesh`); this mirrors that on the page main thread: script-inject
 * the emscripten build served from the fixtures dir, decode every
 * KHR_draco_mesh_compression primitive back into plain accessors, and
 * repack an uncompressed GLB for GLTFLoader.parse.
 *
 * Decoded attribute data is appended to buffer 0, so the original bufferViews
 * stay valid. Tiles must be single-buffer embedded GLBs (the landmark/mbx
 * tiler output is; a multi-buffer tile fails loudly with a decode error).
 */

const DRACO_EXT = 'KHR_draco_mesh_compression';
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

// glTF componentType → (draco DT_* name, byte length)
const COMPONENT_TYPES: Record<number, { dt: string; bytes: number }> = {
    5120: { dt: 'DT_INT8', bytes: 1 },
    5121: { dt: 'DT_UINT8', bytes: 1 },
    5122: { dt: 'DT_INT16', bytes: 2 },
    5123: { dt: 'DT_UINT16', bytes: 2 },
    5125: { dt: 'DT_UINT32', bytes: 4 },
    5126: { dt: 'DT_FLOAT32', bytes: 4 },
};

const COMPONENT_COUNT: Record<string, number> = {
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16,
};

const DECODER_SCRIPT_URL =
    '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/models/draco/draco_decoder.js';

let decoderModulePromise: Promise<any> | null = null;

/** Load + instantiate the emscripten decoder once per page (mgl keeps a
 * module-level `draco` singleton the same way). */
function loadDracoModule(): Promise<any> {
    if (decoderModulePromise) return decoderModulePromise;
    decoderModulePromise = (async () => {
        const g = globalThis as any;
        if (typeof document !== 'undefined') {
            // Page path (karma): script-inject the emscripten build served
            // from the fixtures dir — webpacking it would pull 512KB into
            // every test bundle.
            if (!g.DracoDecoderModule) {
                await new Promise<void>((resolve, reject) => {
                    const el = document.createElement('script');
                    el.src = DECODER_SCRIPT_URL;
                    el.onload = () => resolve();
                    el.onerror = () => reject(new Error(`decoder script load failed: ${DECODER_SCRIPT_URL}`));
                    document.head.appendChild(el);
                });
            }
            if (typeof g.DracoDecoderModule !== 'function') {
                throw new Error('DracoDecoderModule global missing after script load');
            }
            // MODULARIZE build: the factory resolves `Module.ready`.
            return await g.DracoDecoderModule();
        }
        // Node path (unit tests): require the same fixtures copy the page
        // injects. No package.json declares type:module above the fixtures
        // dir, so node resolves the emscripten UMD wrapper via module.exports.
        // The indirect require hides the dynamic path from webpack.
        const nodePath = typeof require !== 'undefined' && typeof __dirname !== 'undefined'
            ? require('path').join(__dirname, '..', '..', 'test', 'rendering',
                'integration', 'models', 'draco', 'draco_decoder.js')
            : '';
        const factory = eval('require')(nodePath);
        return await factory();
    })();
    // Never leave a rejected singleton — surface the error to the caller of
    // this load, but allow a later retry (e.g. a transiently missing file).
    decoderModulePromise.catch(() => { decoderModulePromise = null; });
    return decoderModulePromise;
}

/** Parse the GLB container (exported for mesh_features detection). */
export function parseGlb(buffer: ArrayBuffer): { json: any; bin: Uint8Array } {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB');
    if (view.getUint32(4, true) !== 2) throw new Error('unsupported GLB version');
    let off = 12;
    let json: any = null;
    let bin: Uint8Array | null = null;
    while (off < buffer.byteLength) {
        const len = view.getUint32(off, true);
        const type = view.getUint32(off + 4, true);
        const data = new Uint8Array(buffer, off + 8, len);
        if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(data));
        else if (type === CHUNK_BIN) bin = data;
        off += 8 + len;
    }
    if (!json) throw new Error('GLB without JSON chunk');
    return { json, bin: bin ?? new Uint8Array(0) };
}

function packGlb(json: any, bin: Uint8Array): ArrayBuffer {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    const binPad = (4 - (bin.length % 4)) % 4;
    const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint32(0, GLB_MAGIC, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonBytes.length + jsonPad, true);
    view.setUint32(16, CHUNK_JSON, true);
    out.set(jsonBytes, 20);
    for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20;
    let o = 20 + jsonBytes.length + jsonPad;
    view.setUint32(o, bin.length + binPad, true);
    view.setUint32(o + 4, CHUNK_BIN, true);
    out.set(bin, o + 8);
    return out.buffer;
}

function viewBytes(bin: Uint8Array, json: any, bufferViewIndex: number): Uint8Array {
    const bv = json.bufferViews[bufferViewIndex];
    const start = bv.byteOffset ?? 0;
    return bin.subarray(start, start + bv.byteLength);
}

/**
 * Decode every Draco primitive of a GLB tile and repack it as an
 * uncompressed GLB. Non-Draco tiles pass through unchanged (same buffer).
 */
export async function decodeGlbDraco(buffer: ArrayBuffer): Promise<ArrayBuffer> {
    const { json, bin } = parseGlb(buffer);
    const hasDraco = (json.meshes ?? []).some((m: any) =>
        (m.primitives ?? []).some((p: any) => p.extensions?.[DRACO_EXT]));
    if (!hasDraco) return buffer;
    if ((json.buffers ?? []).length !== 1 || json.buffers[0].uri !== undefined) {
        throw new Error('decodeGlbDraco requires a single embedded GLB buffer');
    }

    const draco = await loadDracoModule();
    // Appended chunks, 4-byte aligned (glTF accessor alignment). Offsets are
    // booked against the NEW buffer, whose first bin.length bytes are the
    // original BIN chunk the existing bufferViews point into.
    const chunks: Uint8Array[] = [];
    let appended = bin.length;
    let decoded = false;
    try {
        for (const mesh of json.meshes ?? []) {
            for (const prim of mesh.primitives ?? []) {
                const config = prim.extensions?.[DRACO_EXT];
                if (!config) continue;
                const bytes = viewBytes(bin, json, config.bufferView);
                // mgl creates a fresh Decoder per primitive (loadDracoMesh).
                const decoder = new draco.Decoder();

                const geometry = new draco.Mesh();
                const ok = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, geometry);
                // three's build returns a Status object (truthy even on
                // failure); mgl's returns a plain boolean.
                const okFlag = typeof ok === 'object' && ok !== null && typeof ok.ok === 'function'
                    ? ok.ok() : !!ok;
                if (!okFlag) throw new Error('DecodeArrayToMesh failed');

                // Indices: sized by the original accessor (tiler guarantees
                // count/componentType match — mgl reads them the same way).
                const indexAccessor = json.accessors[prim.indices];
                const idxType = COMPONENT_TYPES[indexAccessor.componentType];
                const indicesSize = indexAccessor.count * idxType.bytes;
                let ptr = draco._malloc(indicesSize);
                if (idxType.bytes === 2) decoder.GetTrianglesUInt16Array(geometry, indicesSize, ptr);
                else decoder.GetTrianglesUInt32Array(geometry, indicesSize, ptr);
                // three's emscripten build exposes heap views (HEAPU8/HEAPF32)
                // instead of `memory`; read the wasm heap fresh after the Get
                // call (heap growth would detach a stale buffer).
                const indicesBuffer = draco.HEAPU8.buffer.slice(ptr, ptr + indicesSize);
                draco._free(ptr);
                const rIdx = appendChunk(chunks, appended, indicesBuffer);
                indexAccessor.bufferView = addBufferView(json, rIdx.offset, indicesSize);
                appended = rIdx.end;

                for (const attributeName of Object.keys(config.attributes)) {
                    const attribute = decoder.GetAttributeByUniqueId(geometry, config.attributes[attributeName]);
                    const accessor = json.accessors[prim.attributes[attributeName]];
                    const type = COMPONENT_TYPES[accessor.componentType];
                    const numComponents = COMPONENT_COUNT[accessor.type];
                    const dataSize = accessor.count * numComponents * type.bytes;
                    const ptr2 = draco._malloc(dataSize);
                    decoder.GetAttributeDataArrayForAllPoints(geometry, attribute, draco[type.dt], dataSize, ptr2);
                    const attrBuffer = draco.HEAPU8.buffer.slice(ptr2, ptr2 + dataSize);
                    draco._free(ptr2);
                    const rAttr = appendChunk(chunks, appended, attrBuffer);
                    accessor.bufferView = addBufferView(json, rAttr.offset, dataSize);
                    appended = rAttr.end;
                }

                draco.destroy(geometry);
                draco.destroy(decoder);
                decoded = true;
                delete prim.extensions[DRACO_EXT];
                if (prim.extensions && Object.keys(prim.extensions).length === 0) delete prim.extensions;
            }
        }
    } catch (e) {
        // Surface the failing tile; the renderer records it in its stats.
        throw e;
    }

    if (!decoded) return buffer;

    // Strip the extension so GLTFParser doesn't reject the repacked asset.
    if (Array.isArray(json.extensionsUsed)) {
        json.extensionsUsed = json.extensionsUsed.filter((e: string) => e !== DRACO_EXT);
    }
    if (Array.isArray(json.extensionsRequired)) {
        json.extensionsRequired = json.extensionsRequired.filter((e: string) => e !== DRACO_EXT);
    }

    const newBin = new Uint8Array(bin.length + appended);
    newBin.set(bin, 0);
    let o = bin.length;
    for (const chunk of chunks) { newBin.set(chunk, o); o += chunk.length; }
    json.buffers[0].byteLength = newBin.length;
    return packGlb(json, newBin);
}

function addBufferView(json: any, byteOffset: number, byteLength: number): number {
    json.bufferViews.push({ buffer: 0, byteOffset, byteLength });
    return json.bufferViews.length - 1;
}

/** Append data (with 4-byte alignment padding) and return the data
 * start offset plus the end offset for the next append. */
function appendChunk(chunks: Uint8Array[], appended: number, buffer: ArrayBuffer):
    { offset: number; end: number } {
    const pad = (4 - (appended % 4)) % 4;
    if (pad) chunks.push(new Uint8Array(pad));
    chunks.push(new Uint8Array(buffer));
    return { offset: appended + pad, end: appended + pad + buffer.byteLength };
}
