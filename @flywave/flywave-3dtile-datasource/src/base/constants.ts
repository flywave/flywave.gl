/* Copyright (C) 2025 flywave.gl contributors */

export const UNLOADED = 0;
export const QUEUED = 1;
export const LOADING = 2;
export const PARSING = 3;
export const LOADED = 4;
export const FAILED = 5;

export enum LoadState {
    UNLOADED,
    QUEUED,
    LOADING,
    PARSING,
    LOADED,
    FAILED
}
