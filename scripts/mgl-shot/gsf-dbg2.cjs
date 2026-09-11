(async () => {
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: process.env.HOME + "/.cache/puppeteer/chrome-headless-shell/linux-149.0.7827.22/chrome-headless-shell-linux64/chrome-headless-shell",
    headless: "shell",
    args: ["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--enable-webgl","--ignore-gpu-blocklist","--use-mock-keychain","--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 2 });
  page.on('response', async r => { if (r.status() >= 400) console.log('[resp]', r.status(), r.url().slice(0,140)); });
  await page.goto("http://localhost:8130/scripts/mgl-shot/mgl-shot.html?fixture=" + encodeURIComponent("model-layer/ground-shadow-fog"), { waitUntil: "load", timeout: 60000 });
  await new Promise(r => setTimeout(r, 12000));
  await browser.close();
})();
