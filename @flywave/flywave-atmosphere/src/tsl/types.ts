/* Copyright (C) 2025 flywave.gl contributors */

import type { FloatType, HalfFloatType, Uniform } from "three/webgpu";

export type UniformMap<T> = Omit<Map<string, Uniform>, "get"> & {
    get: <K extends keyof T>(key: K) => T[K];
    set: <K extends keyof T>(key: K, value: T[K]) => void;
};

export type AnyFloatType = typeof FloatType | typeof HalfFloatType;

/**
 * Reinterprets the type of a value without any runtime cost.
 * Used to work around missing type declarations in three.js's WebGPU API.
 */
export function reinterpretType<T>(value: unknown): asserts value is T {}
