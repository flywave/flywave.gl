#!/usr/bin/env node
/*
 * Generate a full-suite baseline snapshot from a chunked render-test run.
 *
 * Walks every *.ibct-result.json under the report dir, emits:
 *   1. <out>/baseline-snapshot.json — {_comment, meta, values, summary}
 *      (values: fixture name → mismatchedPixels; mirrors the ml0901 format
 *      so later runs can diff against it fixture-for-fixture)
 *   2. <out>/baseline-summary.md — pass/fail counts, family rollups and the
 *      top offenders for next-step planning.
 *
 * Usage:
 *   node scripts/generate-mbstyle-baseline-snapshot.js [reportDir] [outDir]
 *     (defaults: ./rendering-test-results/mbstyle ./rendering-test-results)
 */
const fs = require("fs");
const path = require("path");

const reportDir = path.resolve(process.argv[2] || "rendering-test-results/mbstyle");
const outDir = path.resolve(process.argv[3] || "rendering-test-results");

const rows = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ibct-result.json")) rows.push(p);
    }
})(reportDir);

const values = {};
let passed = 0;
let failed = 0;
const failures = [];
const families = {};
for (const p of rows) {
    let d;
    try {
        d = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
        continue;
    }
    const name = d.imageProps?.name
        ?? path.relative(reportDir, p).replace(/\.ibct-result\.json$/, "");
    const mm = d.mismatchedPixels ?? -1;
    values[name] = mm;
    const fam = name.split("/").slice(0, 2).join("/");
    const famTop = name.split("/")[0];
    for (const f of [famTop, fam]) {
        families[f] = families[f] || { total: 0, passed: 0, mismatch: 0 };
        families[f].total += 1;
        families[f].mismatch += Math.max(mm, 0);
    }
    if (d.passed) {
        passed += 1;
        families[famTop].passed += 1;
        families[fam].passed += 1;
    } else {
        failed += 1;
        failures.push({ name, mm, thr: d.imageProps?.imageThreshold });
    }
}
failures.sort((a, b) => b.mm - a.mm);

const stamp = new Date().toISOString().slice(0, 10);
const snapshot = {
    _comment: `全量基线快照（${stamp}，ChromeHeadless 131 MacOS，逐 fixture mismatchedPixels + pass/fail），供下一轮对齐计划对比。`,
    meta: {
        capturedAt: new Date().toISOString(),
        reportDir: path.relative(process.cwd(), reportDir),
        fixtures: rows.length,
        passed,
        failed,
    },
    values,
};
const snapPath = path.join(outDir, `ml${stamp.replace(/-/g, "").slice(2)}-baseline-snapshot.json`);
fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 1));

const lines = [];
lines.push(`# MBStyle render-test 全量基线（${stamp}）`);
lines.push("");
lines.push(`- 夹具总数: ${rows.length}（PASS ${passed} / FAIL ${failed}，通过率 ${(100 * passed / Math.max(1, rows.length)).toFixed(1)}%）`);
lines.push(`- 快照: ${path.relative(process.cwd(), snapPath)}`);
lines.push("");
lines.push("## 家族汇总（按总 mismatch 排序，Top 25）");
lines.push("");
lines.push("| 家族 | 夹具 | PASS | 总 mismatch |");
lines.push("|---|---:|---:|---:|");
const famRows = Object.entries(families)
    .filter(([k]) => !k.includes("/"))
    .map(([k, v]) => [k, v]);
famRows.sort((a, b) => b[1].mismatch - a[1].mismatch);
for (const [k, v] of famRows.slice(0, 25)) {
    lines.push(`| ${k} | ${v.total} | ${v.passed} | ${v.mismatch} |`);
}
lines.push("");
lines.push("## 失败夹具 Top 40（按 mismatch 排序）");
lines.push("");
lines.push("| 夹具 | mismatch |");
lines.push("|---|---:|");
for (const f of failures.slice(0, 40)) {
    lines.push(`| ${f.name} | ${f.mm} |`);
}
lines.push("");
const sumPath = path.join(outDir, `baseline-summary-${stamp}.md`);
fs.writeFileSync(sumPath, lines.join("\n") + "\n");

console.log(`fixtures=${rows.length} passed=${passed} failed=${failed}`);
console.log(`snapshot: ${snapPath}`);
console.log(`summary:  ${sumPath}`);
