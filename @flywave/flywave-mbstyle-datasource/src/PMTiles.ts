/*
 * PMTiles v3 single-file archive reader (spec: protomaps/PMTiles spec/v3).
 *
 * Fetches the whole archive once and serves tiles from memory — sized for
 * the render-test fixtures (archives < 3MB). HTTP-range-based lazy loading
 * would be the production shape; this keeps the fixture path dependency-free.
 *
 * Layout: 127-byte header | root dir | JSON metadata | leaf dirs | tile data.
 * Directories (and metadata) are gzip-compressed; tiles may be gzip or raw.
 * Tile IDs are cumulative Hilbert-curve positions across zoom levels.
 */

interface DirectoryEntry {
    tileId: number;
    offset: number;
    length: number;
    runLength: number;
}

function readVarint(buf: Uint8Array, pos: { i: number }): number {
    let val = 0, shift = 0, b: number;
    do {
        b = buf[pos.i++];
        val += (b & 0x7f) * Math.pow(2, shift);
        shift += 7;
    } while (b & 0x80);
    return val;
}

/** Hilbert curve position (Wikipedia xy2d: rotation stays in full order n). */
function hilbertXY(xIn: number, yIn: number, n: number): number {
    let x = xIn, y = yIn;
    let d = 0;
    for (let s = n >> 1; s > 0; s >>= 1) {
        const rx = (x & s) > 0 ? 1 : 0;
        const ry = (y & s) > 0 ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry === 0) {
            if (rx === 1) {
                x = n - 1 - x;
                y = n - 1 - y;
            }
            const t = x; x = y; y = t;
        }
    }
    return d;
}

export function zxyToTileId(z: number, x: number, y: number): number {
    if (z === 0) return 0;
    if (x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return -1;
    let acc = 0;
    for (let tz = 0; tz < z; tz++) acc += (2 ** tz) * (2 ** tz);
    return acc + hilbertXY(x, y, 2 ** z);
}

function deserializeDirectory(bytes: Uint8Array): DirectoryEntry[] {    const pos = { i: 0 };
    const n = readVarint(bytes, pos);
    const entries: DirectoryEntry[] = new Array(n);
    let lastId = 0;
    for (let i = 0; i < n; i++) {
        lastId += readVarint(bytes, pos);
        entries[i] = { tileId: lastId, offset: 0, length: 0, runLength: 0 };
    }
    for (let i = 0; i < n; i++) entries[i].runLength = readVarint(bytes, pos);
    for (let i = 0; i < n; i++) entries[i].length = readVarint(bytes, pos);
    for (let i = 0; i < n; i++) {
        const v = readVarint(bytes, pos);
        if (v === 0 && i > 0) {
            entries[i].offset = entries[i - 1].offset + entries[i - 1].length;
        } else {
            entries[i].offset = v - 1;
        }
    }
    return entries;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
    const DS = (globalThis as any).DecompressionStream;
    if (!DS) throw new Error('DecompressionStream unavailable');
    const stream = new Blob([bytes as any]).stream().pipeThrough(new DS('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Inverse of zxyToTileId: cumulative-Hilbert id → [z, x, y]. */
export function tileIdToZxy(i: number): [number, number, number] {
    let acc = 0;
    for (let z = 0; z < 26; z++) {
        const n = 2 ** z;
        const num = n * n;
        if (acc + num > i) {
            return [z, ...(hilbertDToXY(i - acc, n) as [number, number])];
        }
        acc += num;
    }
    throw new Error('tile id out of range');
}

function hilbertDToXY(dIn: number, n: number): [number, number] {
    let x = 0, y = 0;
    let d = dIn;
    for (let s = 1; s < n; s *= 2) {
        const rx = 1 & (d >> 1);
        const ry = 1 & (d ^ rx);
        if (ry === 0) {
            if (rx === 1) {
                x = s - 1 - x;
                y = s - 1 - y;
            }
            const t = x; x = y; y = t;
        }
        x += s * rx;
        y += s * ry;
        d >>= 2;
    }
    return [x, y];
}

export class PMTilesArchive {
    private m_data: Uint8Array;
    private m_rootDir: DirectoryEntry[] = [];
    private m_leafDirs = new Map<number, DirectoryEntry[]>();
    private m_internalCompression = 0;
    private m_tileCompression = 0;
    minZoom = 0;
    maxZoom = 22;

    private constructor(data: Uint8Array) {
        this.m_data = data;
    }

    static async open(data: Uint8Array): Promise<PMTilesArchive> {
        const a = new PMTilesArchive(data);
        await a.parseHeader();
        return a;
    }

    private async parseHeader(): Promise<void> {
        const d = this.m_data;
        const magic = String.fromCharCode(...d.subarray(0, 7));
        if (magic !== 'PMTiles' || d[7] !== 3) {
            throw new Error(`Not a PMTiles v3 archive: ${magic} v${d[7]}`);
        }
        const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
        const rootOff = Number(dv.getBigUint64(8, true));
        const rootLen = Number(dv.getBigUint64(16, true));
        this.m_internalCompression = d[97];
        this.m_tileCompression = d[98];
        this.minZoom = d[100];
        this.maxZoom = d[101];
        const rootRaw = d.subarray(rootOff, rootOff + rootLen);
        const root = this.m_internalCompression === 2 ? await gunzip(rootRaw) : rootRaw;
        this.m_rootDir = deserializeDirectory(root);
    }

    private async directoryFor(tileId: number): Promise<DirectoryEntry[]> {
        // Leaf pointer entries (runLength 0) cover [tileId, next entry tileId).
        let lo = 0, hi = this.m_rootDir.length - 1, m = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.m_rootDir[mid].tileId <= tileId) { m = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        if (m < 0) return this.m_rootDir;
        const entry = this.m_rootDir[m];
        if (entry.runLength !== 0) return this.m_rootDir;
        let leaf = this.m_leafDirs.get(m);
        if (!leaf) {
            const dv = new DataView(this.m_data.buffer, this.m_data.byteOffset);
            const leafOff = Number(dv.getBigUint64(40, true)); // leaf dir section
            const raw = this.m_data.subarray(
                leafOff + entry.offset, leafOff + entry.offset + entry.length);
            const dirBytes = this.m_internalCompression === 2 ? await gunzip(raw) : raw;
            leaf = deserializeDirectory(dirBytes);
            this.m_leafDirs.set(m, leaf);
        }
        return leaf;
    }

    /**
     * Get a tile's bytes (decompressed if the archive gzip-stores tiles),
     * or null when the archive has no entry for z/x/y.
     */
    async getTile(z: number, x: number, y: number): Promise<Uint8Array | null> {
        const tileId = zxyToTileId(z, x, y);
        if (tileId < 0) return null;
        const dir = await this.directoryFor(tileId);
        let lo = 0, hi = dir.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const e = dir[mid];
            if (tileId < e.tileId) hi = mid - 1;
            else if (tileId >= e.tileId + Math.max(e.runLength, 1)) lo = mid + 1;
            else {
                if (e.runLength === 0) return null;
                const dv = new DataView(this.m_data.buffer, this.m_data.byteOffset);
                const dataOff = Number(dv.getBigUint64(56, true)); // tile data section
                const start = dataOff + e.offset;
                let bytes = this.m_data.subarray(start, start + e.length);
                if (this.m_tileCompression === 2) bytes = await gunzip(bytes);
                return bytes;
            }
        }
        return null;
    }

    /**
     * Visit every tile in the archive (walking leaf directories). Runs
     * entries' tile-id ranges through tileIdToZxy to recover z/x/y.
     */
    async forEachTile(cb: (z: number, x: number, y: number, bytes: Uint8Array) => Promise<void> | void): Promise<void> {
        const dv = new DataView(this.m_data.buffer, this.m_data.byteOffset);
        const dataOff = Number(dv.getBigUint64(56, true));
        const dirs: DirectoryEntry[][] = [this.m_rootDir];
        // Expand leaf pointers (single level per spec).
        for (const e of this.m_rootDir) {
            if (e.runLength === 0) {
                const leafOff = Number(dv.getBigUint64(40, true));
                const raw = this.m_data.subarray(leafOff + e.offset, leafOff + e.offset + e.length);
                // eslint-disable-next-line no-await-in-loop
                const dirBytes = this.m_internalCompression === 2 ? await gunzip(raw) : raw;
                dirs.push(deserializeDirectory(dirBytes));
            }
        }
        for (const dir of dirs) {
            for (const e of dir) {
                if (e.runLength === 0) continue;
                for (let id = e.tileId; id < e.tileId + e.runLength; id++) {
                    const [z, x, y] = tileIdToZxy(id);
                    let bytes = this.m_data.subarray(dataOff + e.offset, dataOff + e.offset + e.length);
                    if (this.m_tileCompression === 2) {
                        // eslint-disable-next-line no-await-in-loop
                        bytes = await gunzip(bytes);
                    }
                    // eslint-disable-next-line no-await-in-loop
                    await cb(z, x, y, bytes);
                }
            }
        }
    }

    /** JSON metadata (name/attribution/vector_layers…), or null. */
    async metadata(): Promise<any | null> {
        try {
            const dv = new DataView(this.m_data.buffer, this.m_data.byteOffset);
            const off = Number(dv.getBigUint64(24, true));
            const len = Number(dv.getBigUint64(32, true));
            const raw = this.m_data.subarray(off, off + len);
            const bytes = this.m_internalCompression === 2 ? await gunzip(raw) : raw;
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            return null;
        }
    }
}

/** Cache: one open archive per URL. */
const archiveCache = new Map<string, Promise<PMTilesArchive>>();

/**
 * Small-archive serving strategy: expand every tile into a Blob URL up
 * front. Downstream image/texture loaders (raster quads, hillshade DEM
 * tiles) then consume ordinary URLs — zero changes to their fetch paths.
 * Key format "z/x/y".
 */
export class PMTilesBlobIndex {
    readonly urls = new Map<string, string>();
    minZoom = 0;
    maxZoom = 22;

    static async open(url: string): Promise<PMTilesBlobIndex> {
        const archive = await openPMTilesUrl(url);
        const idx = new PMTilesBlobIndex();
        idx.minZoom = archive.minZoom;
        idx.maxZoom = archive.maxZoom;
        await archive.forEachTile((z, x, y, bytes) => {
            idx.urls.set(`${z}/${x}/${y}`, URL.createObjectURL(new Blob([bytes as any])));
        });
        return idx;
    }

    urlFor(z: number, x: number, y: number): string | undefined {
        return this.urls.get(`${z}/${x}/${y}`);
    }
}

const blobIndexCache = new Map<string, Promise<PMTilesBlobIndex>>();

export function openPMTilesBlobIndex(url: string): Promise<PMTilesBlobIndex> {
    let p = blobIndexCache.get(url);
    if (!p) {
        p = PMTilesBlobIndex.open(url);
        p.catch(() => blobIndexCache.delete(url));
        blobIndexCache.set(url, p);
    }
    return p;
}

export function openPMTilesUrl(url: string): Promise<PMTilesArchive> {
    let p = archiveCache.get(url);
    if (!p) {
        p = (async () => {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`PMTiles fetch failed: ${url} (${resp.status})`);
            return PMTilesArchive.open(new Uint8Array(await resp.arrayBuffer()));
        })();
        p.catch(() => archiveCache.delete(url));
        archiveCache.set(url, p);
    }
    return p;
}
