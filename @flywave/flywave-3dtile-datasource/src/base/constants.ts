/* Copyright (C) 2025 flywave.gl contributors */

export const UNLOADED = 0;
export const LOADING = 1;
export const PARSING = 2;
export const LOADED = 3;
export const FAILED = 4;

export enum LoadState {
    UNLOADED,
    LOADING,
    PARSING,
    LOADED,
    FAILED
}
