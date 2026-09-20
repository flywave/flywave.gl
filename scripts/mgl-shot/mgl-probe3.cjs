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
                        if (!es || !es.vertexPositions) continue;
                        const vp = es.vertexPositions;
                        const vn = es.vertexNormals;
                        const stride = vp.length / (vn ? vn.length : 1);
                        const f16 = [];
                        for (let i = 0; i < Math.min(16, vp.length); i++) f16.push(+(vp[i] ?? 0).toFixed(2));
                        const f8n = [];
                        if (vn) for (let i = 0; i < Math.min(8, vn.length); i++) f8n.push(+(vn[i] ?? 0).toFixed(2));
                        out[bn] = {
                            vpType: vp.constructor?.name,
                            vpLen: vp.length,
                            vnLen: vn ? vn.length : -1,
                            strideHint: stride,
                            first16: f16,
                            firstNormals: f8n,
                            attrs: es.intersectionsAttributes ? Object.keys(es.intersectionsAttributes.members ?? es.intersectionsAttributes) : null,
                        };
                    }
                }
            }
            return out;
        });
        console.log(JSON.stringify(dump, null, 1).slice(0, 2500));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
