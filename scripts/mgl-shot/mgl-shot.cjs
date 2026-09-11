// §885 终一六八 rebuild: CDP capture of the vendored mgl rendering a fixture
// style. Usage:
//   node tmp/mgl-shot.cjs <family/case> [out.png]
// Requires: repo-root static server on :8130 (python3 -m http.server 8130)
// and the built vendored bundle (mapbox-gl-js/dist/mapbox-gl.js).
const path = require("path");

const CHROME = process.env.CHROME_BIN ||
    path.join(process.env.HOME,
        ".cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.108/chrome-headless-shell-mac-arm64/chrome-headless-shell");

(async () => {
    const puppeteer = await import("puppeteer-core");
    const fixture = process.argv[2];
    const out = process.argv[3] || `tmp/mgl-live-${fixture.replace(/\//g, "__")}.png`;
    if (!fixture) {
        console.error("usage: node tmp/mgl-shot.cjs <family/case> [out.png]");
        process.exit(1);
    }
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: "shell",
        args: [
            "--no-sandbox", "--disable-dev-shm-usage",
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist",
            "--use-mock-keychain", "--hide-scrollbars",
        ],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 2 });
        await page.goto(
            `http://localhost:8130/scripts/mgl-shot/mgl-shot.html?fixture=${encodeURIComponent(fixture)}`,
            { waitUntil: "load", timeout: 60000 });
        await page.waitForFunction("window.__shotReady === true", { timeout: 60000 });
        await new Promise((r) => setTimeout(r, 500));
        const errors = await page.evaluate("window.__mbErrors ?? []");
        if (errors.length) console.log("[mgl-shot] page errors:", errors.slice(0, 5));
        await page.screenshot({ path: out });
        console.log(`[mgl-shot] saved ${out}`);
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
