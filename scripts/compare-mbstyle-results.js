#!/usr/bin/env node
/*
 * Compare two MBStyle render-test result trees (per-test *.ibct-result.json).
 *
 * Usage:
 *   node scripts/compare-mbstyle-results.js <newResultsDir> <baselineDir> [category]
 *
 * e.g.
 *   node scripts/compare-mbstyle-results.js \
 *     rendering-test-results/mbstyle rendering-test-results/mbstyle-ml0901 model-layer
 *
 * Keys fixtures by their path relative to the mbstyle-render-<category> dir
 * (handles both flat and subdirectory-shaped trees). Prints:
 *   - per-fixture old→new with delta and %, flagging pass/fail flips
 *   - per-family aggregation (first path segment, or the fixture name when flat)
 *   - the top regressions and top improvements
 */
const fs = require("fs");
const path = require("path");

const [newDir, baseDir, category = ""] = process.argv.slice(2);
if (!newDir || !baseDir) {
    console.error("Usage: compare-mbstyle-results.js <newDir> <baselineDir> [category]");
    process.exit(1);
}

function collect(root) {
    const out = new Map();
    if (!fs.existsSync(root)) return out;
    const walk = (dir, rel, top) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                // Top-level platform dirs (web-ChromeHeadless-*) are not part
                // of the fixture key.
                walk(p, top && e.name.startsWith("web-") ? "" : rel ? `${rel}/${e.name}` : e.name, false);
                continue;
            }
            if (!e.name.endsWith(".ibct-result.json")) continue;
            if (category) {
                const seg = rel.split("/")[0];
                if (seg && !seg.startsWith(`mbstyle-render-${category}`)) continue;
            }
            try {
                const res = JSON.parse(fs.readFileSync(p, "utf8"));
                const key = (rel ? rel + "/" : "") + e.name.replace(/\.ibct-result\.json$/, "");
                out.set(key, {
                    px: res.mismatchedPixels ?? null,
                    passed: !!res.passed,
                    name: res.imageProps?.name ?? key,
                });
            } catch { /* skip malformed */ }
        }
    };
    walk(root, "", true);
    return out;
}

// Normalize: strip a leading "model-layer/" so flat and hierarchical trees key alike.
function normalizeKey(key) {
    return key.replace(/^model-layer\//, "");
}

const now = new Map();
const base = new Map();
for (const [k, v] of collect(newDir)) now.set(normalizeKey(k), v);
for (const [k, v] of collect(baseDir)) {
    const nk = normalizeKey(k);
    if (!base.has(nk)) base.set(nk, v);
}

const rows = [];
for (const [key, b] of base) {
    const n = now.get(key);
    rows.push({
        key,
        old: b.px,
        new: n ? n.px : null,
        status: !n ? "MISSING" : !b.passed && n.passed ? "FLIP-PASS" : b.passed && !n.passed ? "FLIP-FAIL" : "",
        oldPassed: b.passed,
        newPassed: n ? n.passed : null,
    });
}
for (const [key, n] of now) {
    if (!base.has(key)) rows.push({ key, old: null, new: n.px, status: "NEW", oldPassed: null, newPassed: n.passed });
}

const fmt = (v) => v === null || v === undefined ? "—" : String(v);
const delta = (r) => r.old === null || r.new === null ? null : r.new - r.old;

rows.sort((a, b) => (delta(b) ?? 0) - (delta(a) ?? 0));

console.log(`\n=== per-fixture (baseline ${baseDir.split("/").pop()} → new ${newDir.split("/").pop()}) ===`);
console.log("family/fixture".padEnd(58) + "old".padStart(9) + "new".padStart(9) + "Δ".padStart(10) + "  status");
for (const r of rows) {
    const d = delta(r);
    const dStr = d === null ? "—" : (d > 0 ? "+" : "") + d;
    const pct = d !== null && r.old ? `(${(d / r.old * 100).toFixed(0)}%)` : "";
    console.log(r.key.padEnd(58) + fmt(r.old).padStart(9) + fmt(r.new).padStart(9) + (dStr + pct).padStart(12) + "  " + r.status);
}

// Family aggregation: first path segment when the tree is hierarchical,
// else the longest common leading token group of the fixture name.
const families = new Map();
for (const r of rows) {
    const parts = r.key.split("/");
    const fam = parts.length > 1 ? parts[0] : (r.key.match(/^(landmark-[a-z-]+?|buildings-trees[a-z-]*|trees-[a-z-]+?|models-[a-z-]+|MAPS3D-\d+[a-z-]*)\//) ? r.key : r.key.replace(/(-lod)?\/[^/]*$/, ""));
    const famKey = parts.length > 1 ? parts[0] : r.key.split("/")[0];
    void fam;
    const f = families.get(famKey) ?? { old: 0, new: 0, n: 0, miss: 0 };
    if (r.old !== null) f.old += r.old; else f.miss++;
    if (r.new !== null) f.new += r.new; else f.miss++;
    f.n++;
    families.set(famKey, f);
}

console.log(`\n=== per-family ===`);
console.log("family".padEnd(50) + "old".padStart(10) + "new".padStart(10) + "Δ".padStart(12) + "  n");
for (const [fam, f] of [...families.entries()].sort((a, b) => (b[1].new - b[1].old) - (a[1].new - a[1].old))) {
    const d = f.new - f.old;
    console.log(fam.padEnd(50) + String(f.old).padStart(10) + String(f.new).padStart(10) + ((d > 0 ? "+" : "") + d).padStart(12) + `  ${f.n}${f.miss ? ` (missing ${f.miss})` : ""}`);
}

const flips = rows.filter(r => r.status.startsWith("FLIP"));
if (flips.length) {
    console.log(`\n=== pass/fail flips ===`);
    for (const r of flips) console.log(`${r.status}  ${r.key}  ${fmt(r.old)} → ${fmt(r.new)}`);
}
const missing = rows.filter(r => r.status === "MISSING");
if (missing.length) {
    console.log(`\n=== in baseline but missing from new run (${missing.length}) ===`);
    for (const r of missing) console.log("  " + r.key);
}
