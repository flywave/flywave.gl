#!/usr/bin/env node
/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Downloads the complete CesiumJS 3D Tiles test dataset (Specs/Data/Cesium3DTiles)
 * for the strict integration tests.
 *
 * Usage: node scripts/test-data/download.mjs [output-directory]
 */

import fs from "node:fs/promises";
import path from "node:path";

const CESIUM_REPO = "CesiumGS/cesium";
const CESIUM_REF = "main";
const DATA_PREFIX = "Specs/Data/Cesium3DTiles/";
// Gaussian splats are not supported by this package's loaders.
const SKIP_PREFIXES = ["GaussianSplats"];
const CONCURRENCY = 10;

const outputDir = path.resolve(process.argv[2] || ".tiles-test-data");

async function fetchJson(url) {
    const response = await fetch(url, { headers: { "User-Agent": "flywave-3dtiles-test" } });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function downloadFile(entry) {
    const relativePath = entry.path.slice(DATA_PREFIX.length);
    const destination = path.join(outputDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });

    const urls = [
        `https://cdn.jsdelivr.net/gh/${CESIUM_REPO}@${CESIUM_REF}/${entry.path}`,
        `https://raw.githubusercontent.com/${CESIUM_REPO}/${CESIUM_REF}/${entry.path}`
    ];

    let lastError = null;
    for (const url of urls) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: { "User-Agent": "flywave-3dtiles-test" }
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
                return;
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
            }
        }
    }

    throw new Error(`${relativePath}: ${lastError?.message}`);
}

async function main() {
    console.log(`Fetching repository index for ${CESIUM_REPO}@${CESIUM_REF}...`);
    const tree = await fetchJson(
        `https://api.github.com/repos/${CESIUM_REPO}/git/trees/${CESIUM_REF}?recursive=1`
    );
    if (tree.truncated) {
        throw new Error("GitHub tree response was truncated; cannot enumerate test data");
    }

    const files = tree.tree.filter(
        entry =>
            entry.type === "blob" &&
            entry.path.startsWith(DATA_PREFIX) &&
            !SKIP_PREFIXES.some(prefix => entry.path.startsWith(DATA_PREFIX + prefix))
    );

    const totalBytes = files.reduce((sum, entry) => sum + (entry.size || 0), 0);
    console.log(
        `Downloading ${files.length} files (${(totalBytes / 1048576).toFixed(
            1
        )} MB) to ${outputDir}`
    );

    let index = 0;
    let completed = 0;
    const failures = [];

    async function worker() {
        while (index < files.length) {
            const entry = files[index++];
            try {
                await downloadFile(entry);
                completed++;
                if (completed % 100 === 0) {
                    console.log(`  ${completed}/${files.length}`);
                }
            } catch (error) {
                failures.push(error.message);
            }
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log(`Downloaded ${completed}/${files.length} files.`);
    if (failures.length > 0) {
        console.error(`${failures.length} downloads failed:`);
        failures.forEach(message => console.error(`  ${message}`));
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
