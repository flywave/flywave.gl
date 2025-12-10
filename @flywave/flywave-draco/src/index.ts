/* Copyright (C) 2025 flywave.gl contributors */

// Module constants
export {
    DRACO_EXTERNAL_LIBRARIES,
    DRACO_EXTERNAL_LIBRARY_URLS
} from "./loader/draco-module-loader";

// Draco data types

export type { DracoMesh, DracoLoaderData } from "./loader/draco-types";

// Draco Writer

export type { DracoWriterOptions } from "./draco-writer";
export { DracoWriterWorker, DracoWriter } from "./draco-writer";

// Draco Loader

export type { DracoLoaderOptions, loadDraco } from "./draco-loader";
export { DracoWorkerLoader, DracoLoader } from "./draco-loader";
