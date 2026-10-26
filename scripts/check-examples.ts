/* Copyright (C) 2026 flywave.gl contributors */

/* eslint-disable no-console */

/**
 * Gate script for @flywave/flywave-examples.
 *
 * Validates every example folder under "@flywave/flywave-examples/src/<example>/":
 * - structural requirements (index.ts|index.js, config.ts, thumbnail.png)
 * - example config v2 schema (regex-parsed, no TS evaluation)
 * - debug-probe blacklist scan (internal examples are exempt)
 * - soft size limits and per-category `order` duplicates
 *
 * The v2 migration is in progress: missing *optional* v2 fields
 * (level/dataPolicy/concerns/tags/apis/...) are NOT reported by default.
 * Pass `--strict` to report them as warnings.
 *
 * Usage (from the repository root):
 *   ts-node ./scripts/check-examples.ts [--strict]
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXAMPLES_SRC = path.resolve(process.cwd(), "@flywave/flywave-examples/src");

/**
 * Shared infrastructure directories under src/ that expose an index barrel
 * but are not examples (never listed in the gallery).
 */
const NON_EXAMPLE_DIRS: ReadonlySet<string> = new Set(["common", "template", "decoder"]);

/** Legal v2 `code` categories. */
const VALID_CODES = [
    "getting-started",
    "data-sources",
    "terrain-elevation",
    "tiles-3d",
    "styling-theming",
    "rendering-effects",
    "interaction",
    "models-integration",
    "internal"
] as const;

const VALID_LEVELS = ["beginner", "intermediate", "advanced"] as const;
const VALID_DATA_POLICIES = ["offline", "open-data", "token"] as const;

/** Optional v2 fields reported (as warnings) only in --strict mode. */
const STRICT_FIELDS: Array<{ key: string; present: (config: string) => boolean }> = [
    { key: "titleZh", present: c => /\btitleZh\s*:/.test(c) },
    { key: "descriptionZh", present: c => /\bdescriptionZh\s*:/.test(c) },
    { key: "level", present: c => /\blevel\s*:/.test(c) },
    { key: "tags", present: c => /\btags\s*:/.test(c) },
    { key: "apis", present: c => /\bapis\s*:/.test(c) },
    { key: "concerns", present: c => /\bconcerns\s*:/.test(c) },
    { key: "dataPolicy", present: c => /\bdataPolicy\s*:/.test(c) }
];

/** Debug-probe / private-network blacklist. Any hit in a public example is an error. */
const BLACKLIST: Array<{ name: string; regex: RegExp }> = [
    { name: "__fwStats", regex: /__fwStats/ },
    { name: "__probe", regex: /__probe/ },
    { name: "window.mapView", regex: /window\.mapView/ },
    { name: "window.__", regex: /window\.__/ },
    { name: "192.168.", regex: /192\.168\./ },
    { name: "http://10.", regex: /http:\/\/10\./ },
    { name: "localhost:", regex: /localhost:/ }
];

const WARN_LINES = 300;
const ERROR_LINES = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IssueLevel = "error" | "warning";

interface Issue {
    level: IssueLevel;
    message: string;
}

interface ExampleReport {
    name: string;
    status: "OK" | "WARN" | "FAIL" | "SKIP";
    issues: Issue[];
}

// ---------------------------------------------------------------------------
// Regex-based config.ts parsing (config must not be required/evaluated)
// ---------------------------------------------------------------------------

function parseStringField(config: string, key: string): string | undefined {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`\\b${escaped}\\s*:\\s*(?:"([^"]*)"|'([^']*)')`).exec(config);
    if (match === null) {
        return undefined;
    }
    return match[1] ?? match[2];
}

function parseNumberField(config: string, key: string): number | undefined {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`\\b${escaped}\\s*:\\s*(-?\\d+)`).exec(config);
    return match === null ? undefined : Number(match[1]);
}

/**
 * Parses a `key: ["a", "b"]` string-array field.
 * `valid` is false when the key is present but contains non-string-literal elements.
 */
function parseArrayField(
    config: string,
    key: string
): { present: boolean; elements: string[]; valid: boolean } {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const present = new RegExp(`\\b${escaped}\\s*:`).test(config);
    const match = new RegExp(`\\b${escaped}\\s*:\\s*\\[([\\s\\S]*?)\\]`).exec(config);
    if (match === null) {
        return { present, elements: [], valid: !present };
    }
    const rawElements = match[1]
        .split(",")
        .map(e => e.trim())
        .filter(e => e.length > 0);
    let valid = true;
    const elements: string[] = [];
    for (const raw of rawElements) {
        const s = /^(?:"([^"]*)"|'([^']*)')$/.exec(raw);
        if (s === null) {
            valid = false;
            elements.push(raw);
        } else {
            elements.push(s[1] ?? s[2]);
        }
    }
    return { present: true, elements, valid };
}

interface ParsedConfig {
    title?: string;
    description?: string;
    code?: string;
    order?: number;
    level?: string;
    dataPolicy?: string;
    internal: boolean;
    arrays: Record<string, { present: boolean; elements: string[]; valid: boolean }>;
}

function parseConfig(content: string): ParsedConfig {
    const concerns = parseArrayField(content, "concerns");
    const tags = parseArrayField(content, "tags");
    const apis = parseArrayField(content, "apis");
    return {
        title: parseStringField(content, "title"),
        description: parseStringField(content, "description"),
        code: parseStringField(content, "code"),
        order: parseNumberField(content, "order"),
        level: parseStringField(content, "level"),
        dataPolicy: parseStringField(content, "dataPolicy"),
        internal: /\binternal\s*:\s*true\b/.test(content),
        arrays: { concerns, tags, apis }
    };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkStructure(
    example: ExampleReport,
    dir: string,
    hasIndex: boolean,
    hasConfigTs: boolean,
    configPath: string | undefined,
    configContent: string | undefined,
    parsed: ParsedConfig | undefined
): void {
    if (!hasIndex) {
        example.issues.push({ level: "error", message: "missing index.ts (or index.js)" });
    }
    if (!hasConfigTs) {
        example.issues.push({
            level: "error",
            message:
                configPath === undefined
                    ? "missing config.ts"
                    : "missing config.ts (only legacy config.js found)"
        });
    }
    if (configPath === undefined || configContent === undefined || parsed === undefined) {
        return;
    }
    if (parsed.title === undefined) {
        example.issues.push({ level: "error", message: "config: missing `title`" });
    }
    if (parsed.description === undefined) {
        example.issues.push({ level: "error", message: "config: missing `description`" });
    }
    if (parsed.code === undefined) {
        example.issues.push({ level: "error", message: "config: missing `code`" });
    } else if (!(VALID_CODES as readonly string[]).includes(parsed.code)) {
        example.issues.push({
            level: "error",
            message: `config: \`code: "${
                parsed.code
            }"\` is not a valid v2 code (expected one of: ${VALID_CODES.join(", ")})`
        });
    }
    if (parsed.order === undefined) {
        example.issues.push({ level: "error", message: "config: missing `order`" });
    }
    if (!fs.existsSync(path.join(dir, "thumbnail.png"))) {
        example.issues.push({ level: "error", message: "missing thumbnail.png" });
    }
}

function checkEnums(example: ExampleReport, parsed: ParsedConfig): void {
    if (parsed.level !== undefined && !(VALID_LEVELS as readonly string[]).includes(parsed.level)) {
        example.issues.push({
            level: "error",
            message: `config: \`level: "${
                parsed.level
            }"\` is invalid (expected one of: ${VALID_LEVELS.join(", ")})`
        });
    }
    if (
        parsed.dataPolicy !== undefined &&
        !(VALID_DATA_POLICIES as readonly string[]).includes(parsed.dataPolicy)
    ) {
        example.issues.push({
            level: "error",
            message: `config: \`dataPolicy: "${
                parsed.dataPolicy
            }"\` is invalid (expected one of: ${VALID_DATA_POLICIES.join(", ")})`
        });
    }
    for (const key of ["concerns", "tags", "apis"] as const) {
        const array = parsed.arrays[key];
        if (!array.present || array.valid) {
            continue;
        }
        example.issues.push({
            level: "error",
            message: `config: \`${key}\` must be an array of strings`
        });
    }
}

function checkStrictFields(example: ExampleReport, configContent: string): void {
    for (const field of STRICT_FIELDS) {
        if (!field.present(configContent)) {
            example.issues.push({
                level: "warning",
                message: `config: optional v2 field \`${field.key}\` missing (strict mode)`
            });
        }
    }
}

/** Main .ts files of an example: index.ts plus other top-level .ts files (config.ts excluded). */
function getMainTsFiles(dir: string): string[] {
    return fs
        .readdirSync(dir)
        .filter(f => f.endsWith(".ts") && f !== "config.ts")
        .sort()
        .map(f => path.join(dir, f));
}

function checkBlacklist(example: ExampleReport, files: string[], exempt: boolean): void {
    if (exempt) {
        return;
    }
    for (const file of files) {
        const lines = fs.readFileSync(file, "utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
            for (const rule of BLACKLIST) {
                if (rule.regex.test(lines[i])) {
                    example.issues.push({
                        level: "error",
                        message: `${path.basename(file)}:${i + 1}: blacklist hit [${rule.name}]`
                    });
                }
            }
        }
    }
}

function checkSize(example: ExampleReport, files: string[]): void {
    for (const file of files) {
        const lineCount = fs.readFileSync(file, "utf8").split("\n").length;
        const rel = path.basename(file);
        if (lineCount > ERROR_LINES) {
            example.issues.push({
                level: "error",
                message: `${rel} is too large: ${lineCount} lines (max ${ERROR_LINES})`
            });
        } else if (lineCount > WARN_LINES) {
            example.issues.push({
                level: "warning",
                message: `${rel} is large: ${lineCount} lines (soft limit ${WARN_LINES})`
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function main(): void {
    const strict = process.argv.includes("--strict");
    if (!fs.existsSync(EXAMPLES_SRC)) {
        console.error(`examples source directory not found: ${EXAMPLES_SRC}`);
        console.error("run this script from the repository root");
        process.exit(1);
    }

    const entries = fs
        .readdirSync(EXAMPLES_SRC, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();

    const reports: ExampleReport[] = [];
    const orders = new Map<string, Map<number, string[]>>(); // code -> order -> example names

    for (const name of entries) {
        const report: ExampleReport = { name, status: "OK", issues: [] };
        const dir = path.join(EXAMPLES_SRC, name);

        const tsIndexPath = path.join(dir, "index.ts");
        const jsIndexPath = path.join(dir, "index.js");
        const hasIndex = fs.existsSync(tsIndexPath) || fs.existsSync(jsIndexPath);
        const hasAnyConfig =
            fs.existsSync(path.join(dir, "config.ts")) ||
            fs.existsSync(path.join(dir, "config.js"));

        // Not an example folder (no config and no index at all) -> skip.
        if (!hasIndex && !hasAnyConfig) {
            report.status = "SKIP";
            report.issues.push({ level: "warning", message: "not an example folder (skipped)" });
            reports.push(report);
            continue;
        }

        // Shared infrastructure that happens to expose an index barrel
        // (src/common) is not an example either.
        if (NON_EXAMPLE_DIRS.has(name)) {
            report.status = "SKIP";
            report.issues.push({ level: "warning", message: "shared infrastructure (skipped)" });
            reports.push(report);
            continue;
        }

        // config.ts is required (legacy config.js only triggers an error, but is
        // still parsed so that code/order checks apply to it).
        let configPath: string | undefined;
        let configContent: string | undefined;
        const hasConfigTs = fs.existsSync(path.join(dir, "config.ts"));
        if (hasConfigTs) {
            configPath = path.join(dir, "config.ts");
            configContent = fs.readFileSync(configPath, "utf8");
        } else if (fs.existsSync(path.join(dir, "config.js"))) {
            configPath = path.join(dir, "config.js");
            configContent = fs.readFileSync(configPath, "utf8");
        }
        const parsed = configContent !== undefined ? parseConfig(configContent) : undefined;

        checkStructure(report, dir, hasIndex, hasConfigTs, configPath, configContent, parsed);
        if (parsed !== undefined) {
            checkEnums(report, parsed);
            if (strict) {
                checkStrictFields(report, configContent!);
            }

            const code = parsed.code;
            const order = parsed.order;
            if (
                code !== undefined &&
                order !== undefined &&
                (VALID_CODES as readonly string[]).includes(code)
            ) {
                let byOrder = orders.get(code);
                if (byOrder === undefined) {
                    byOrder = new Map();
                    orders.set(code, byOrder);
                }
                const names = byOrder.get(order) ?? [];
                names.push(name);
                byOrder.set(order, names);
            }
        }

        const mainFiles = getMainTsFiles(dir);
        checkBlacklist(report, mainFiles, parsed?.internal === true);
        checkSize(report, mainFiles);

        const hasError = report.issues.some(i => i.level === "error");
        report.status = hasError ? "FAIL" : report.issues.length > 0 ? "WARN" : "OK";
        reports.push(report);
    }

    // Duplicate `order` within the same v2 category -> warning.
    const duplicateIssues = new Map<string, string[]>();
    for (const [code, byOrder] of orders) {
        for (const [order, names] of byOrder) {
            if (names.length > 1) {
                for (const name of names) {
                    const list = duplicateIssues.get(name) ?? [];
                    list.push(
                        `code "${code}" order ${order} shared with: ${names
                            .filter(n => n !== name)
                            .join(", ")}`
                    );
                    duplicateIssues.set(name, list);
                }
            }
        }
    }
    for (const report of reports) {
        if (report.status === "SKIP") {
            continue;
        }
        for (const message of duplicateIssues.get(report.name) ?? []) {
            report.issues.push({ level: "warning", message: `duplicate \`order\`: ${message}` });
        }
        const hasError = report.issues.some(i => i.level === "error");
        report.status = hasError ? "FAIL" : report.issues.length > 0 ? "WARN" : "OK";
    }

    // ---------------------------------------------------------------------------
    // Report
    // ---------------------------------------------------------------------------

    let errors = 0;
    let warnings = 0;
    let skipped = 0;

    for (const report of reports) {
        if (report.status === "SKIP") {
            skipped++;
            console.log(`SKIP ${report.name}`);
            continue;
        }
        console.log(`${report.status} ${report.name}`);
        for (const issue of report.issues) {
            const marker = issue.level === "error" ? "ERROR" : "WARN ";
            if (issue.level === "error") {
                errors++;
            } else {
                warnings++;
            }
            console.log(`  ${marker} ${issue.message}`);
        }
    }

    const examples = reports.length - skipped;
    console.log("");
    console.log(
        `${examples} examples, ${skipped} skipped, ${errors} errors, ${warnings} warnings` +
            (strict ? " (strict mode)" : "")
    );
    if (errors > 0) {
        process.exit(1);
    }
}

main();
