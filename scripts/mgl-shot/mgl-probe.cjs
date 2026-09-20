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
                        if (!es || !es.unevalEdges) continue;
                        const portalCounts = new Map();
                        for (const e of es.unevalEdges) {
                            const k = e.portalHash != null ? e.portalHash.toString() : '?';
                            portalCounts.set(k, (portalCounts.get(k) ?? 0) + 1);
                        }
                        let portalShared = 0;
                        for (const [, n] of portalCounts) if (n > 1) portalShared += n;
                        // per-feature portal sharing
                        const perFeat = {};
                        for (const e of es.unevalEdges) {
                            const k = e.featureInfo ? `f${e.featureInfo.featureIndex}` : '?';
                            perFeat[k] = perFeat[k] ?? { total: 0, portalShared: 0 };
                            perFeat[k].total++;
                        }
                        // second pass: mark portal-shared edges per feature
                        const sharedPortal = new Set([...portalCounts.entries()].filter(([, n]) => n > 1).map(([h]) => h));
                        for (const e of es.unevalEdges) {
                            const k = e.featureInfo ? `f${e.featureInfo.featureIndex}` : '?';
                            if (sharedPortal.has(e.portalHash != null ? e.portalHash.toString() : '?')) perFeat[k].portalShared++;
                        }
                        out[bn + '@' + tk] = {
                            total: es.unevalEdges.length,
                            uniquePortals: portalCounts.size,
                            edgesOnSharedPortals: portalShared,
                            perFeat,
                        };
                    }
                }
            }
            return out;
        });
        console.log(JSON.stringify(dump, null, 1).slice(0, 3000));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
