/* Copyright (C) 2025 flywave.gl contributors */

/**
 * flywave.gl token configuration file
 * Unified management of all access tokens
 */

// Cesium Ion access token
// NOTE: read `process.env.CESIUM_ION_TOKEN` as the EXACT expression the
// webpack DefinePlugin replaces — with a `typeof process !== "undefined"`
// guard the browser bundle would short-circuit (no `process` global) and the
// baked token would never be seen.
export const CESIUM_ION_TOKEN = process.env.CESIUM_ION_TOKEN
    ? process.env.CESIUM_ION_TOKEN
    : typeof window !== "undefined" && (window as any).CESIUM_ION_TOKEN
        ? (window as any).CESIUM_ION_TOKEN
        : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOTFkYWMzNC1mYjI1LTRlYTYtYTc2ZS04NWI1MTU2OTVlMDYiLCJpZCI6Mzg2NzksImlhdCI6MTY0MTE5NTAyNn0.4xsIJgYTK81yhRu67GG0x2FMit6zpYFCWsvWSwiFVV4";

// Other possible configuration items can be added here
