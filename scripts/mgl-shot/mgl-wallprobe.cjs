// §885 g164: wall-parity probe — loads the mgl-shot page with ?wallprobe=1
// and dumps window.__wallDump (mgl structure mesh vertices / feature
// sections / bucket feature ids) to a JSON file.
// Usage:
//   node scripts/mgl-shot/mgl-wallprobe.cjs <family/case> [out.json]
// Requires: repo-root static server on :8130.
const path = require("path");

const CHROME = process.env.CHROME_BIN ||
    path.join(process.env.HOME,
        ".cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.108/chrome-headless-shell-mac-arm64/chrome-headless-shell");

(async () => {
    const puppeteer = await import("puppeteer-core");
    const fixture = process.argv[2];
    const out = process.argv[3] || `tmp/mgl-wallprobe-${fixture.replace(/\//g, "__")}.json`;
    if (!fixture) {
        console.error("usage: node scripts/mgl-shot/mgl-wallprobe.cjs <family/case> [out.json]");
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
        await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
        page.on('console', m => { const t = m.text?.() ?? ''; if (t) (globalThis.__c ||= []).push(t); });
        await page.goto(
            `http://localhost:8130/scripts/mgl-shot/mgl-shot.html?fixture=${encodeURIComponent(fixture)}&wallprobe=1`,
            { waitUntil: "load", timeout: 60000 });
        try {
            await page.waitForFunction("window.__wallDump !== undefined", { timeout: 60000 });
        } catch (e) {
            const errs = await page.evaluate("window.__mbErrors ?? []").catch(() => []);
            console.log("[wallprobe] TIMEOUT errors=", JSON.stringify(errs.slice(0, 5)),
                "console=", JSON.stringify(((globalThis.__c) ?? []).slice(-8)));
        }
        await new Promise((r) => setTimeout(r, 1500));
        const dump = await page.evaluate("window.__wallDump ?? null");
        require("fs").writeFileSync(out, JSON.stringify(dump, null, 1));
        const d = dump ?? {};
        console.log("[wallprobe] tiles=", d.nTiles ?? '?',
            "entries=", (d.tiles ?? []).length,
            "->", out);
        for (const t of (d.tiles ?? []).slice(0, 12)) {
            console.log("  ", t.layer ?? t.err, t.key ?? '', "nVert=", t.nVert,
                "idxLen=", t.idxLen, "tunnelSeg=", JSON.stringify(t.tunnelSeg),
                "tunnelSections=", JSON.stringify(t.tunnelSections)?.slice(0, 200));
        }
    } finally {
        await browser.close();
    }
})();
