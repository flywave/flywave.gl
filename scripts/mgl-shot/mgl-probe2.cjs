const path = require("path");
const CHROME = process.env.CHROME_BIN ||
    path.join(process.env.HOME,
        ".cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.108/chrome-headless-shell-mac-arm64/chrome-headless-shell");
(async () => {
    const puppeteer = await import("puppeteer-core");
    const fixture = process.argv[2] || "3d-intersections/shadows-junction";
    const browser = await puppeteer.launch({
        executablePath: CHROME, headless: "shell",
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle",
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--enable-webgl", "--ignore-gpu-blocklist", "--use-mock-keychain",
            "--hide-scrollbars"],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
        await page.goto(
            `http://localhost:8130/scripts/mgl-shot/mgl-shot.html?fixture=${encodeURIComponent(fixture)}`,
            { waitUntil: "load", timeout: 60000 });
        await page.waitForFunction("window.__shotReady === true", { timeout: 60000 });
        await new Promise((r) => setTimeout(r, 800));
        const dump = await page.evaluate(() => {
            const map = window.__mbMap;
            const caches = map.style._sourceCaches ?? {};
            const out = {};
            for (const id of Object.keys(caches)) {
                const cache = caches[id]._sourceCache ?? caches[id];
                const tiles = cache._tiles ?? {};
                for (const tk of Object.keys(tiles)) {
                    const tile = tiles[tk];
                    const breg = tile._bucketRegistry ?? tile.buckets;
                    const buckets = breg ? (breg._buckets ?? breg) : {};
                    for (const bn of Object.keys(buckets)) {
                        const es = buckets[bn].hdExt && buckets[bn].hdExt.elevatedStructures;
                        if (!es) continue;
                        const segInfo = (sv) => {
                            if (!sv) return null;
                            const segs = sv.segments ?? [];
                            return segs.map(s => ({
                                primOffset: s.primitiveOffset,
                                primLen: s.primitiveLength,
                                vertOffset: s.vertexOffset,
                                vertLen: s.vertexLength,
                            }));
                        };
                        out[bn + '@' + tk] = {
                            builtVerts: es.vertexPositions ? es.vertexPositions.length / 4 : -1,
                            bridgeSegs: segInfo(es.renderableBridgeSegments),
                            tunnelSegs: segInfo(es.renderableTunnelSegments),
                            maskSegs: segInfo(es.maskSegments),
                            depthSegs: segInfo(es.depthSegments),
                        };
                        // rail verts: bridge segment vertex ranges -> sample positions
                        const bs = segInfo(es.renderableBridgeSegments);
                        if (bs && bs.length && es.vertexPositions) {
                            const s0 = bs[0];
                            const sample = [];
                            for (let v = s0.vertOffset; v < Math.min(s0.vertOffset + 8, es.vertexPositions.length / 4); v++) {
                                const p = es.vertexPositions[v];
                                const n = es.vertexNormals ? es.vertexNormals[v] : null;
                                sample.push({ pos: Array.from(p ?? []), nrm: n ? Array.from(n) : null });
                            }
                            out[bn + '@' + tk].sampleVerts = sample;
                        }
                    }
                }
            }
            return out;
        });
        console.log(JSON.stringify(dump, null, 1).slice(0, 6000));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
