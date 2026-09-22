const path = require("path");
const CHROME = process.env.CHROME_BIN || path.join(process.env.HOME, ".cache/puppeteer/chrome-headless-shell/linux-149.0.7827.22/chrome-headless-shell-linux64/chrome-headless-shell");
(async () => {
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({executablePath: CHROME, headless: "shell",
        args: ["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--enable-webgl","--ignore-gpu-blocklist","--use-mock-keychain","--hide-scrollbars"]});
    const page = await browser.newPage();
    await page.setViewport({width:512, height:512, deviceScaleFactor:1});
    await page.goto(`http://localhost:8130/scripts/mgl-shot/mgl-shot.html?fixture=${encodeURIComponent(process.argv[2])}`, {waitUntil:"load", timeout:60000});
    await page.waitForFunction("window.__shotReady === true", {timeout:60000});
    const tiles = await page.evaluate(() => {
        const st = window.__mbMap.style;
        const sc = Object.values(st._sourceCaches ?? st.sourceCaches ?? {})[0];
        return Object.keys(sc._tiles);
    });
    console.log(JSON.stringify(tiles));
    await browser.close();
})().catch(e => {console.error(e); process.exit(1);});
