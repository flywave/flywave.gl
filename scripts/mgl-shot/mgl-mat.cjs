// §885 g52q: dump live mgl shadowRenderer cascade matrices + direction.
const path = require("path");
const CHROME = process.env.CHROME_BIN ||
    path.join(process.env.HOME,
        ".cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.108/chrome-headless-shell-mac-arm64/chrome-headless-shell");
(async () => {
    const puppeteer = await import("puppeteer-core");
    const fixture = process.argv[2] || "3d-intersections/shadows-double-shading-regression";
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
        await new Promise((r) => setTimeout(r, 500));
        const dump = await page.evaluate(() => {
            const sr = window.__mbMap?.painter?.shadowRenderer;
            if (!sr) return { err: "no shadowRenderer" };
            const fmt = (m) => m ? Array.from(m).map(x => +x.toExponential(6)) : null;
            const out = {
                shadowDirection: sr.shadowDirection ? Array.from(sr.shadowDirection).map(x => +x.toFixed(5)) : null,
                enabled: sr.enabled,
                cascades: (sr._cascades ?? []).map((c, i) => ({
                    i,
                    matrix: fmt(c.matrix),
                    boundingSphereRadius: c.boundingSphereRadius,
                    far: c.far,
                })),
                uniformKeys: sr._uniformValues ? Object.keys(sr._uniformValues) : null,
                fadeRange: sr._uniformValues ? sr._uniformValues.u_fade_range : null,
                intensity: sr._uniformValues ? sr._uniformValues.u_shadow_intensity : null,
                texel: sr._uniformValues ? sr._uniformValues.u_shadow_texel_size : null,
                resolution: sr._shadowParameters ? sr._shadowParameters.shadowMapResolution : null,
            };
            return out;
        });
        console.log(JSON.stringify(dump, null, 1).slice(0, 3500));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
