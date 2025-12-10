/* Copyright (C) 2025 flywave.gl contributors */

import type { DracoBuildOptions } from "./loader/draco-builder";
import DRACOBuilder from "./loader/draco-builder";
import { loadDracoEncoderModule } from "./loader/draco-module-loader";
import type { DracoMesh } from "./loader/draco-types";
import { VERSION } from "./loader/utils/version";

/** Writer Options for draco */
export interface DracoWriterOptions {
    draco?: DracoBuildOptions & {
        method?: "MESH_EDGEBREAKER_ENCODING" | "MESH_SEQUENTIAL_ENCODING";
        speed?: [number, number];
        quantization?: Record<string, number>;
        attributeNameEntry?: string;
    };
}

const DEFAULT_DRACO_WRITER_OPTIONS = {
    pointcloud: false, // Set to true if pointcloud (mode: 0, no indices)
    attributeNameEntry: "name"
    // Draco Compression Parameters
    // method: 'MESH_EDGEBREAKER_ENCODING', // Use draco defaults
    // speed: [5, 5], // Use draco defaults
    // quantization: { // Use draco defaults
    //   POSITION: 10
    // }
};

/**
 * Browser worker doesn't work because of issue during "draco_encoder.js" loading.
 * Refused to execute script from 'https://raw.githubusercontent.com/google/draco/1.4.1/javascript/draco_encoder.js' because its MIME type ('') is not executable.
 */
export const DracoWriterWorker = {
    id: "draco-writer",
    name: "Draco compressed geometry writer",
    module: "draco",
    version: VERSION,
    worker: true,
    options: {
        draco: {},
        source: null
    }
};

/**
 * Exporter for Draco3D compressed geometries
 */
export const DracoWriter = {
    name: "DRACO",
    id: "draco",
    module: "draco",
    version: VERSION,
    extensions: ["drc"],
    mimeTypes: ["application/octet-stream"],
    options: {
        draco: DEFAULT_DRACO_WRITER_OPTIONS
    },
    encode
} as const;

async function encode(data: DracoMesh, options: DracoWriterOptions = {}): Promise<ArrayBuffer> {
    // Dynamically load draco
    const { draco } = await loadDracoEncoderModule(options);
    const dracoBuilder = new DRACOBuilder(draco);

    try {
        return dracoBuilder.encodeSync(data, options.draco);
    } finally {
        dracoBuilder.destroy();
    }
}
