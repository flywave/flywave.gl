(async () => {
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/linux-149.0.7827.22/chrome-headless-shell-linux64/chrome-headless-shell",
    headless: "shell",
    args: ["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--enable-webgl","--ignore-gpu-blocklist","--use-mock-keychain","--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
  page.on('console', m => console.log('[pg]', m.type(), m.text().slice(0,200)));
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,300)));
  page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(0,120), r.failure()?.errorText));
  await page.goto("http://localhost:8130/scripts/mgl-shot/mgl-shot.html?fixture=" + encodeURIComponent("model-layer/ground-shadow-fog"), { waitUntil: "load", timeout: 60000 });
  await new Promise(r => setTimeout(r, 15000));
  const st = await page.evaluate("({ready: window.__shotReady, errs: window.__mbErrors, hasMap: !!window.__mbMap, zoom: window.__mbMap && window.__mbMap.getZoom()})").catch(e=>String(e));
  console.log('[st]', JSON.stringify(st));
  await browser.close();
})();
