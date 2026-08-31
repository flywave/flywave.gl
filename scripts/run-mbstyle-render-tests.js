#!/usr/bin/env node
/*
 * Automated render-test evaluation for MBStyleDataSource.
 *
 * Flow:
 *   1. Starts the RenderingTestResultServer (saves actual.png / diff.png /
 *      result JSON for every test, serves an HTML report).
 *   2. Runs karma (headless) which renders each style, compares with the
 *      local expected.png, and POSTs results to the server.
 *   3. Prints a per-test summary (pass/fail + mismatched pixels) and the
 *      report URL.
 *
 * Usage:
 *   node scripts/run-mbstyle-render-tests.js [filter...]
 *     e.g. node scripts/run-mbstyle-render-tests.js zoom-history
 *          node scripts/run-mbstyle-render-tests.js symbol-z-order default-across
 *
 * Env:
 *   CHROME_BIN     - path to the chrome/chrome-headless-shell binary (required)
 *   MBSTYLE_REPORT - output dir for results (default ./rendering-test-results/mbstyle)
 *   MBSTYLE_PORT   - port for the result server (default 8081)
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const filters = process.argv.slice(2);
const outputDir = process.env.MBSTYLE_REPORT || path.join("rendering-test-results", "mbstyle");
const port = process.env.MBSTYLE_PORT || "8081";

const root = path.resolve(__dirname, "..");
const resultsRoot = path.isAbsolute(outputDir) ? outputDir : path.join(root, outputDir);
const serverJs = path.join(
    root,
    "@flywave/flywave-test-utils/lib/src/rendering/RenderingTestResultServer.js",
);

if (!process.env.CHROME_BIN) {
    console.error("ERROR: CHROME_BIN env must point to a Chrome/headless-shell binary.");
    process.exit(1);
}

function main() {
    // 1. Start the result server (writes results into outputDir).
    fs.mkdirSync(resultsRoot, { recursive: true });
    // Purge corrupt/empty result JSONs BEFORE spawning the server — its
    // loadSavedResults JSON.parse crashes on them and it dies silently,
    // making every later capture stale (§174/§183).
    try {
        const { execSync } = require("child_process");
        const files = execSync(
            `find ${resultsRoot} -name '*.json' -size -2c`,
            { encoding: "utf8" }
        ).trim();
        for (const f of files.split("\n").filter(Boolean)) fs.rmSync(f);
        if (files) console.log(`Purged ${files.split("\n").length} empty result JSON(s)`);
    } catch {}
    const server = spawn(process.execPath, [serverJs, outputDir], {
        cwd: root,
        env: {
            ...process.env,
            HOST: "localhost",
            PORT: port,
        },
        stdio: "inherit",
    });
    server.on("error", (err) => {
        console.error("Failed to start result server:", err);
        process.exit(1);
    });

    // Give the server a moment to bind.
    const waitMs = 1500;
    setTimeout(() => {
        // 2. Run karma.
        const karmaArgs = [
            "karma", "start",
            "--browsers", "ChromeHeadlessNoSandbox",
        ];
        // karma client args -> KARMA_ARGS env (space separated).
        const karmaClientArgs = [...filters.map((f) => `filter=${f}`), `feedback-url=http://localhost:${port}`,
            ...(process.env.MBSTYLE_LIGHTDBG ? ["lightdbg=1"] : []),
            ...(process.env.MBSTYLE_OCCDBG ? ["occdbg=1"] : []),
            ...(process.env.MBSTYLE_RASRED ? ["rasred=1"] : []),
            ...(process.env.MBSTYLE_LITEDBG ? ["liteldbg=1"] : []),
            ...(process.env.MBSTYLE_RASUVDBG ? ["rasuvdbg=1"] : []),
            ...(process.env.MBSTYLE_DECODEDBG ? ["decodedbg=1"] : []),
            ...(process.env.MBSTYLE_RTDUMP ? ["rtdump=1"] : []),
            ...(process.env.MBSTYLE_RTDISABLE ? ["rtdisable=1"] : []),
            ...(process.env.MBSTYLE_UVTDBG ? ["uvtdbg=1"] : []),
            ...(process.env.MBSTYLE_FOGPROBE ? [`fogprobe=${process.env.MBSTYLE_FOGPROBE}`] : []),
            ...(process.env.MBSTYLE_YAWAB ? [`yawab=${process.env.MBSTYLE_YAWAB}`] : []),
            ...(process.env.MBSTYLE_PITCHAB ? [`pitchab=${process.env.MBSTYLE_PITCHAB}`] : []),
            ...(process.env.MBSTYLE_FOGT ? ["fogt=1"] : []),
            ...(process.env.MBSTYLE_HIDE ? [`mbhide=${process.env.MBSTYLE_HIDE}`] : []),
            ...(process.env.MBSTYLE_SHADOW ? [`shadowdbg=${process.env.MBSTYLE_SHADOW}`] : []),
            ...(process.env.MBSTYLE_BATCHEDDBG ? ["mbbatchdbg=1"] : [])];
        const result = spawnSync(
            "npx",
            karmaArgs,
            {
                cwd: root,
                env: {
                    ...process.env,
                    CHROME_BIN: process.env.CHROME_BIN,
                    KARMA_ARGS: karmaClientArgs.join(" "),
                },
                stdio: "inherit",
            },
        );

        // 3. Summarize saved results.
        summarize();

        console.log("\n=== Render-test evaluation complete ===");
        console.log(`Results saved to: ${outputDir}`);
        console.log(`Open the HTML report:  http://localhost:${port}/ibct-report`);
        console.log("(press Ctrl-C to stop the result server)");

        // karma is done: shut the result server down so the process exits by itself.
        server.kill();
        server.on("exit", () => process.exit(result.status ?? 0));
        // Safety net in case the server takes longer than expected to exit.
        setTimeout(() => process.exit(result.status ?? 0), 5000).unref();
    }, waitMs);
}

function summarize() {
    // resultsRoot already defined above
    const files = walk(resultsRoot).filter((f) => f.endsWith(".ibct-result.json"));
    if (files.length === 0) {
        console.log("\nNo test results were recorded (server may not have received feedback).");
        return;
    }
    let passed = 0;
    let failed = 0;
    const failures = [];
    for (const f of files) {
        const res = JSON.parse(fs.readFileSync(f, "utf8"));
        const name = res.imageProps?.name ?? f;
        if (res.passed) {
            passed++;
        } else {
            failed++;
            const mismatched = res.mismatchedPixels ?? "?";
            failures.push(`  FAIL ${name} (${mismatched} mismatched pixels)`);
        }
    }
    console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
    for (const line of failures) console.log(line);
}

function walk(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else out.push(p);
    }
    return out;
}

main();
