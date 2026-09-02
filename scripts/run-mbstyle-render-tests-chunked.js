#!/usr/bin/env node
/*
 * Chunked render-test evaluation for MBStyleDataSource.
 *
 * Memory-safe session model (§742): EVERY karma session covers at most
 * MBSTYLE_BATCH (default 4) fixtures in a fresh browser, and the whole
 * karma+Chrome process GROUP is killed when the session ends (normally, on
 * timeout, or on crash). No session grows big enough to exhaust memory, and
 * no browser survives a session boundary. A final resumeMissing sweep re-runs
 * any fixture that is still missing a result file.
 *
 * Usage:
 *   node scripts/run-mbstyle-render-tests-chunked.js [category...]
 *     (no args = all categories, sorted by test count ascending)
 *
 * Env:
 *   CHROME_BIN             - path to the chrome/edge headless binary (required)
 *   MBSTYLE_REPORT         - output dir for results (default ./rendering-test-results/mbstyle)
 *   MBSTYLE_PORT           - port for the result server (default 8081)
 *   MBSTYLE_BATCH          - fixtures per karma session (default 4)
 *   MBSTYLE_SESSION_TIMEOUT_MS - per-session hard timeout (default 900000 = 15min;
 *                            expiry kills the browser tree and moves on)
 *   MBSTYLE_EXTRA_ARGS     - space-separated extra karma client args
 *                            (modellightport=, modellightgamma=, mbbatchdbg=1, pix=…)
 */
const { spawn, spawnSync, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const onlyCategories = process.argv.slice(2);
const outputDir = process.env.MBSTYLE_REPORT || path.join("rendering-test-results", "mbstyle");
const port = process.env.MBSTYLE_PORT || "8081";
const batch = Math.max(1, parseInt(process.env.MBSTYLE_BATCH || "4", 10));
const sessionTimeoutMs = parseInt(process.env.MBSTYLE_SESSION_TIMEOUT_MS || "900000", 10);
// MBSTYLE_EXTRA_ARGS: space-separated extra karma client args (modellightport=,
// modellightgamma=, mbbatchdbg=1, pix=…) forwarded to every session so A/B
// gates work through the chunked runner too.
const extraArgs = (process.env.MBSTYLE_EXTRA_ARGS || "").split(/\s+/).filter(Boolean);

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
    withCount.sort((a, b) => a.count - b.count);
    return withCount;
}

function listFixtures(category) {
    const names = [];
    (function walk(d, rel) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            const r = rel ? rel + "/" + e.name : e.name;
            if (e.isDirectory()) walk(p, r);
            else if (e.name === "style.json") names.push(path.dirname(r));
        }
    })(path.join(fixturesRoot, category), "");
    return names;
}

// The result server files fixtures under a browser-derived platform dir
// (e.g. web-ChromeHeadless-131.0.6778.108-MacOS) — discover it instead of
// hardcoding one platform (§724).
function fixtureHasResult(cat, fx) {
    let platformDirs = [];
    try {
        platformDirs = fs
            .readdirSync(resultsRoot, { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name.startsWith("web-"))
            .map((e) => e.name);
    } catch {
        return false;
    }
    const flat = fx.replace(/\//g, "-") + ".ibct-result.json";
    const nested = fx + ".ibct-result.json";
    const rel = path.join("mbstyle-render-" + cat.replace(/\//g, "-"));
    return platformDirs.some((d) => {
        const base = path.join(resultsRoot, d, rel);
        return (
            fs.existsSync(path.join(base, flat))
            || fs.existsSync(path.join(base, nested))
        );
    });
}

/**
 * Run ONE karma session (at most `batch` fixtures) as a detached POSIX
 * process group and make sure the whole karma+Chrome tree is dead when it
 * returns — normally, on timeout, or on crash (§742 memory discipline).
 */
function runKarmaSession(filters, port, timeoutMs, label) {
    return new Promise((resolve) => {
        const isPosix = process.platform !== "win32";
        const karmaClientArgs = [
            ...extraArgs,
            ...filters.map((f) => `filter=${f}`),
            `feedback-url=http://localhost:${port}`,
        ];
        const child = spawn(
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
                detached: isPosix,
            },
        );
        let settled = false;
        const killTree = (sig) => {
            try {
                if (isPosix) process.kill(-child.pid, sig);
                else child.kill(sig);
            } catch { /* group already gone */ }
        };
        const sweep = () => {
            // Belt-and-braces: any headless Chrome that outlived the group
            // (karma restart races) dies here. Matches only --headless
            // instances; a normal desktop browser session is never hit.
            try {
                execSync('pkill -9 -f "Google Chrome.*--headless" 2>/dev/null || true', {
                    shell: "/bin/bash",
                });
            } catch { /* nothing matched */ }
        };
        const finish = (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            killTree("SIGKILL");
            sweep();
            resolve(code);
        };
        const timer = setTimeout(() => {
            console.log(`### [${label}] session timeout after ${timeoutMs}ms — killing browser tree`);
            killTree("SIGKILL");
            setTimeout(() => finish(-9), 1500);
        }, timeoutMs);
        child.on("exit", (code) => finish(code));
        child.on("error", () => finish(-1));
    });
}

async function main() {
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
    await new Promise((r) => setTimeout(r, 1500));

    const categories = listCategories().filter(
        (c) => onlyCategories.length === 0 || onlyCategories.includes(c.name),
    );
    const total = categories.reduce((s, c) => s + c.count, 0);
    console.log(`Chunked run: ${categories.length} categories, ${total} tests total.`);
    console.log(`Session model: ≤${batch} fixtures/session, hard timeout ${sessionTimeoutMs}ms, browser tree killed at every session boundary.`);

    // Flatten to (category, fixture) pairs and skip ones that already have a
    // result (re-runs after an interrupted pass pick up where they stopped).
    const pending = [];
    for (const cat of categories) {
        for (const fx of listFixtures(cat.name)) {
            if (!fixtureHasResult(cat.name, fx)) pending.push({ cat: cat.name, fx });
        }
    }
    console.log(`${pending.length} fixtures to run (${total - pending.length} already have results).`);

    let done = 0;
    for (let i = 0; i < pending.length; i += batch) {
        const chunk = pending.slice(i, i + batch);
        const label = `${i + 1}..${i + chunk.length}/${pending.length}`;
        console.log(`\n### session [${label}]: ${chunk.map((c) => c.fx).join(", ")}`);
        await runKarmaSession(
            chunk.map((c) => c.fx),
            port,
            sessionTimeoutMs,
            label,
        );
        done += chunk.length;
        console.log(`### session [${label}] done (${done}/${pending.length}).`);
    }

    // Final resume sweep — §742: default OFF. Persistently crashing
    // fixtures (page-level "Executed 0 of N") would burn 12 × session
    // timeout on futile retries; opt back in with MBSTYLE_RESUME_ROUNDS.
    const resumeRounds = parseInt(process.env.MBSTYLE_RESUME_ROUNDS || "0", 10);
    for (let attempt = 1; attempt <= resumeRounds; attempt++) {
        const missing = [];
        for (const cat of categories) {
            for (const fx of listFixtures(cat.name)) {
                if (!fixtureHasResult(cat.name, fx)) missing.push({ cat: cat.name, fx });
            }
        }
        if (missing.length === 0) break;
        console.log(`\n### resume attempt ${attempt}: ${missing.length} fixtures missing.`);
        const chunk = missing.slice(0, batch).map((m) => m.fx);
        if (chunk.length === 0) break;
        await runKarmaSession(chunk, port, sessionTimeoutMs, `resume-${attempt}`);
    }

    summarize();
    console.log("\n=== Chunked render-test evaluation complete ===");
    console.log(`Results saved to: ${outputDir}`);
    console.log(`Open the HTML report:  http://localhost:${port}/ibct-report`);
    server.kill();
    setTimeout(() => process.exit(0), 500);
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
        try {
            const res = JSON.parse(fs.readFileSync(f, "utf8"));
            const name = res.imageProps?.name ?? f;
            if (res.passed) {
                passed++;
            } else {
                failed++;
                const mismatched = res.mismatchedPixels ?? "?";
                failures.push(`  FAIL ${name} (${mismatched} mismatched pixels)`);
            }
        } catch { /* skip malformed */ }
    }
    console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
    for (const line of failures.slice(0, 20)) console.log(line);
    if (failures.length > 20) console.log(`  … and ${failures.length - 20} more`);
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

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
