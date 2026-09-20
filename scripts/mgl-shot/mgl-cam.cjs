// §885 g52l: dump mgl's live camera state for a fixture (camera-parity work).
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
            const map = window.__mbMap;
            const t = map.transform;
            const r = (o, n) => o && o[n] !== undefined ? +o[n].toFixed(6) : o && o[n];
            const cam = t._camera;
            const out = {
                pitch: r(t, 'pitch'),
                angle: t.angle !== undefined ? +t.angle.toFixed(6) : undefined,
                bearing: r(t, 'bearing'),
                zoom: r(t, 'zoom'),
                center: t.center ? { lng: r(t.center, 'lng'), lat: r(t.center, 'lat') } : null,
                fov: t.fov !== undefined ? +t.fov.toFixed(4) : undefined,
                fovX: t.fovX !== undefined ? +t.fovX.toFixed(4) : undefined,
                aspect: r(t, 'aspect'),
                width: t.width, height: t.height,
                cameraToCenterDistance: t.cameraToCenterDistance,
                worldSize: r(t, 'worldSize'),
                pixelsPerMeter: t.projection && t.projection.pixelsPerMeter ? +(t.projection.pixelsPerMeter(t.center.lat, t.worldSize)).toFixed(6) : null,
                centerOffset: t.centerOffset ? { x: r(t.centerOffset, 'x'), y: r(t.centerOffset, 'y') } : null,
                padding: t._edgeInsets ? { l: t._edgeInsets.left, r: t._edgeInsets.right, t: t._edgeInsets.top, b: t._edgeInsets.bottom } : null,
                cameraPos: null,
                camPitch: cam ? +cam.getPitch?.().toFixed(6) : undefined,
                camBearing: cam ? +cam.getBearing?.().toFixed(6) : undefined,
            };
            try {
                const pos = cam && cam.getMercatorCameraPosition ? cam.getMercatorCameraPosition(t.worldSize) : null;
                if (pos) out.cameraPos = { x: +pos.x.toPrecision(10), y: +pos.y.toPrecision(10), z: +pos.z.toPrecision(10), alt: pos.z != null ? +(pos.z * 40075016.686 * Math.cos(t.center.lat * Math.PI / 180)).toFixed(2) : null };
            } catch (e) { out.cameraPosErr = String(e).slice(0, 80); }
            try {
                const p = t.getCameraQueryGeometry ? null : null;
                const proj = cam && cam.getCameraToCenterProjectionMatrix ? cam.getCameraToCenterProjectionMatrix(t.worldSize) : null;
                if (proj) out.camToCenterProj = Array.from(proj).map(x => +x.toExponential(6));
            } catch (e) { }
            return out;
        });
        console.log(JSON.stringify(dump, null, 1));
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
