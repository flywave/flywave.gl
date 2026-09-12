// §885 终二四六: modelprobe driver — loads the fixture in mgl-shot.html with
// modelprobe=1 and prints window.__modelProbe (calculateModelMatrix replica +
// projected car bbox corners). Usage: node scripts/mgl-shot/model-probe.cjs <family/case>
const path = require("path");

const CHROME = process.env.CHROME_BIN ||
    path.join(process.env.HOME,
        ".cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.108/chrome-headless-shell-mac-arm64/chrome-headless-shell");

(async () => {
    const puppeteer = await import("puppeteer-core");
    const fixture = process.argv[2] || "model-layer/ground-shadow-fog";
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
        await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
        page.on('console', m => { const t = m.text?.() ?? ''; if (t) (globalThis.__c ||= []).push(t); });
        await page.goto(
            `http://localhost:8130/scripts/mgl-shot/mgl-shot.html?fixture=${encodeURIComponent(fixture)}&modelprobe=1`,
            { waitUntil: "load", timeout: 60000 });
        await page.waitForFunction("window.__modelProbe !== undefined", { timeout: 30000 });
        const probe = await page.evaluate("window.__modelProbe");
        console.log(JSON.stringify(probe, null, 1));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
