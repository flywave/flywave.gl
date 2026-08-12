#!/usr/bin/env node
/*
 * Chunked render-test evaluation for MBStyleDataSource.
 *
 * Same flow as run-mbstyle-render-tests.js, but runs the full suite one
 * top-level category at a time so a browser crash / karma failure in one
 * category does not abort the whole baseline. Results accumulate in the
 * same output directory (per-test *.ibct-result.json), and a final
 * aggregated summary is printed.
 *
 * Usage:
 *   node scripts/run-mbstyle-render-tests-chunked.js [category...]
 *     (no args = all categories, sorted by test count ascending)
 *
 * Env:
 *   CHROME_BIN       - path to the chrome/edge headless binary (required)
 *   MBSTYLE_REPORT   - output dir for results (default ./rendering-test-results/mbstyle)
 *   MBSTYLE_PORT     - port for the result server (default 8081)
 *   CHUNK_TIMEOUT_MS - per-category karma timeout (default 1200000 = 20min)
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const onlyCategories = process.argv.slice(2);
const outputDir = process.env.MBSTYLE_REPORT || path.join("rendering-test-results", "mbstyle");
const port = process.env.MBSTYLE_PORT || "8081";
const chunkTimeout = parseInt(process.env.CHUNK_TIMEOUT_MS || "1200000", 10);

const root = path.resolve(__dirname, "..");
const resultsRoot = path.isAbsolute(outputDir) ? outputDir : path.join(root, outputDir);
const serverJs = path.join(
    root,
    "@flywave/flywave-test-utils/lib/src/rendering/RenderingTestResultServer.js",
);
const fixturesRoot = path.join(
    root,
    "@flywave/flywave-mbstyle-datasource/test/render-tests",
);

if (!process.env.CHROME_BIN) {
    console.error("ERROR: CHROME_BIN env must point to a Chrome/Edge binary.");
    process.exit(1);
}

function listCategories() {
    const dirs = fs
        .readdirSync(fixturesRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    const withCount = dirs.map((name) => {
        let count = 0;
        (function walk(d) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) walk(p);
                else if (e.name === "style.json") count++;
            }
        })(path.join(fixturesRoot, name));
        return { name, count };
    });
    // Small categories first: quick feedback, and early crashes lose less.
    withCount.sort((a, b) => a.count - b.count);
    return withCount;
}

function main() {
    fs.mkdirSync(resultsRoot, { recursive: true });
    const server = spawn(process.execPath, [serverJs, outputDir], {
        cwd: root,
        env: { ...process.env, HOST: "localhost", PORT: port },
        stdio: "inherit",
    });
    server.on("error", (err) => {
        console.error("Failed to start result server:", err);
        process.exit(1);
    });

    const categories = listCategories().filter(
        (c) => onlyCategories.length === 0 || onlyCategories.includes(c.name),
    );
    console.log(
        `Chunked run: ${categories.length} categories, ` +
            `${categories.reduce((s, c) => s + c.count, 0)} tests total.`,
    );

    setTimeout(() => {
        // Batch small categories together (multiple filter= args are OR'ed)
        // to amortize karma/webpack startup; big categories get a solo run.
        const batches = [];
        let current = null;
        for (const { name, count } of categories) {
            if (!current || current.count + count > 80) {
                current = { names: [], count: 0 };
                batches.push(current);
            }
            // Trailing slash anchors the substring filter to the directory,
            // but names like "elevated-line-color/..." still contain
            // "line-color/" — duplicate runs are harmless (results overwrite).
            current.names.push(`${name}/`);
            current.count += count;
        }
        console.log(`Batched into ${batches.length} karma runs.`);

        for (const batch of batches) {
            console.log(`\n### [${batch.names.join(", ")}] ~${batch.count} tests ...`);
            const karmaClientArgs = [
                ...batch.names.map((f) => `filter=${f}`),
                `feedback-url=http://localhost:${port}`,
            ];
            const result = spawnSync(
                "npx",
                ["karma", "start", "--browsers", "ChromeHeadlessNoSandbox", "--single-run"],
                {
                    cwd: root,
                    env: {
                        ...process.env,
                        CHROME_BIN: process.env.CHROME_BIN,
                        KARMA_ARGS: karmaClientArgs.join(" "),
                    },
                    stdio: "inherit",
                    timeout: chunkTimeout,
                },
            );
            if (result.error) {
                console.error(`### batch karma aborted: ${result.error.message}`);
            } else if (result.status !== 0) {
                console.error(`### batch karma exited with status ${result.status}`);
            }
        }

        summarize();
        console.log("\n=== Chunked render-test evaluation complete ===");
        console.log(`Results saved to: ${outputDir}`);
        console.log(`Open the HTML report:  http://localhost:${port}/ibct-report`);
        console.log("(press Ctrl-C to stop the result server)");
        server.on("exit", () => process.exit(0));
    }, 1500);
}

function summarize() {
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
