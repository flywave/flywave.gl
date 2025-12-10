/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Draco3D compressed geometries
 */
export const DracoFormat = {
    name: "Draco",
    id: "draco",
    module: "draco",
    extensions: ["drc"],
    mimeTypes: ["application/octet-stream"],
    binary: true,
    tests: ["DRACO"]
} as const;
