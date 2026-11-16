#!/usr/bin/env node
/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Static file server for the local 3D Tiles strict test data.
 *
 * Usage: node scripts/test-data/serve.mjs [data-directory] [port]
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".tiles-test-data");
const port = Number(process.argv[3] || 3010);

const contentTypes = {
    ".json": "application/json",
    ".b3dm": "application/octet-stream",
    ".i3dm": "application/octet-stream",
    ".pnts": "application/octet-stream",
    ".cmpt": "application/octet-stream",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".subtree": "application/octet-stream",
    ".bin": "application/octet-stream",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".geojson": "application/geo+json",
    ".geom": "application/octet-stream"
};

// A tileset with a missing content file, used to test failure handling without
// shipping a broken fixture in the downloaded dataset.
const FAILURE_TILESET = JSON.stringify({
    asset: { version: "1.0" },
    geometricError: 100,
    root: {
        boundingVolume: { region: [-1.3197, 0.6988, -1.3196, 0.6989, 0, 100] },
        geometricError: 0,
        refine: "REPLACE",
        content: { uri: "missing.b3dm" }
    }
});

const server = http.createServer((request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);

        if (pathname === "/fail/tileset.json") {
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Content-Type", "application/json");
            response.end(FAILURE_TILESET);
            return;
        }

        const filePath = path.resolve(root, "." + pathname);
        if (!filePath.startsWith(root + path.sep) && filePath !== root) {
            response.writeHead(403).end("forbidden");
            return;
        }

        const statistics = fs.statSync(filePath);
        if (!statistics.isFile()) {
            response.writeHead(404).end("not found");
            return;
        }

        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader(
            "Content-Type",
            contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
        );
        fs.createReadStream(filePath).pipe(response);
    } catch {
        response.writeHead(404).end("not found");
    }
});

server.listen(port, "127.0.0.1", () => {
    console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
