/* Copyright (C) 2025 flywave.gl contributors */

import type { GeoCoordinates } from "@flywave/flywave-geoutils";

/** 
 * BrushType - Enum defining different types of terrain modification brushes
 * Each brush type corresponds to a specific terrain modification operation
 */
export enum BrushType {
    RAISE = "raise",      // Increases terrain elevation
    LOWER = "lower",      // Decreases terrain elevation
    SMOOTH = "smooth",    // Smooths terrain surface
    FLATTEN = "flatten",  // Flattens terrain to target altitude
    NOISE = "noise",      // Adds noise to terrain surface
    ERODE = "erode"       // Simulates erosion effect
}

/** 
 * BrushTexture - Defines available brush textures/shapes for terrain modification
 * These control the shape and softness of the brush effect
 */
export type BrushTexture = "circle" | "square" | "diamond" | "soft" | "custom";

/** 
 * BaseBrushSettings - Common properties shared by all brush types
 * Contains fundamental parameters for brush operations
 */
export interface BaseBrushSettings {
    radius: number;              // Radius of the brush in meters
    hardness: number;            // Hardness of the brush edge (0.0-1.0)
    texture?: BrushTexture;      // Shape/texture of the brush
}

/** 
 * RaiseSettings - Settings for raising terrain elevation
 * Used when BrushType.RAISE is selected
 */
export interface RaiseSettings extends BaseBrushSettings {
    type: BrushType.RAISE;       // Discriminant field for type identification
    heightDelta: number;         // Amount to increase elevation (positive value)
}

/** 
 * LowerSettings - Settings for lowering terrain elevation
 * Used when BrushType.LOWER is selected
 */
export interface LowerSettings extends BaseBrushSettings {
    type: BrushType.LOWER;       // Discriminant field for type identification
    heightDelta: number;         // Amount to decrease elevation (negative value)
}

/** 
 * SmoothSettings - Settings for smoothing terrain surface
 * Used when BrushType.SMOOTH is selected
 */
export interface SmoothSettings extends BaseBrushSettings {
    type: BrushType.SMOOTH;      // Discriminant field for type identification
    strength: number;            // Strength of smoothing effect (0.0-1.0)
}

/** 
 * FlattenSettings - Settings for flattening terrain to target altitude
 * Used when BrushType.FLATTEN is selected
 */
export interface FlattenSettings extends BaseBrushSettings {
    type: BrushType.FLATTEN;     // Discriminant field for type identification
    targetAltitude: number;      // Target altitude to flatten terrain to
}

/** 
 * NoiseSettings - Settings for adding noise to terrain surface
 * Used when BrushType.NOISE is selected
 */
export interface NoiseSettings extends BaseBrushSettings {
    type: BrushType.NOISE;       // Discriminant field for type identification
    strength: number;            // Strength of noise effect
    scale: number;               // Scale factor for noise pattern
    persistence?: number;        // Persistence of noise (optional)
}

/** 
 * ErodeSettings - Settings for simulating erosion effects
 * Used when BrushType.ERODE is selected
 */
export interface ErodeSettings extends BaseBrushSettings {
    type: BrushType.ERODE;       // Discriminant field for type identification
    strength: number;            // Strength of erosion effect
}

/** 
 * ValidBrushSetting - Mapped type that creates a correspondence between
 * a BrushType and its corresponding settings interface.
 * 
 * This type enables type-safe mapping from a BrushType value to its 
 * appropriate settings type. For example:
 * - ValidBrushSetting<BrushType.RAISE> resolves to RaiseSettings
 * - ValidBrushSetting<BrushType.SMOOTH> resolves to SmoothSettings
 * 
 * @template T - A specific BrushType value
 * @returns The corresponding settings interface for the given type
 */
export type ValidBrushSetting<T extends BrushType> = {
    [BrushType.RAISE]: RaiseSettings;
    [BrushType.LOWER]: LowerSettings;
    [BrushType.SMOOTH]: SmoothSettings;
    [BrushType.FLATTEN]: FlattenSettings;
    [BrushType.NOISE]: NoiseSettings;
    [BrushType.ERODE]: ErodeSettings;
}[T];

/** 
 * BrushSettings - Discriminated Union type combining all possible brush settings
 * 
 * This is the core of our type safety mechanism. It uses the 'type' field 
 * as a discriminant to enable TypeScript's type narrowing capabilities.
 * 
 * This type uses conditional mapping to ensure strict type checking:
 * Each BrushType value maps to its corresponding settings interface.
 * 
 * When code checks the 'type' field of a BrushSettings object, TypeScript 
 * automatically narrows the type to the corresponding specific settings type.
 * For example:
 * 
 * ```typescript
 * function processSettings(settings: BrushSettings) {
 *   if (settings.type === BrushType.RAISE) {
 *     // TypeScript knows this is RaiseSettings, so settings.heightDelta is available
 *     console.log(settings.heightDelta);
 *   } else if (settings.type === BrushType.SMOOTH) {
 *     // TypeScript knows this is SmoothSettings, so settings.strength is available
 *     console.log(settings.strength);
 *   }
 * }
 * ```
 * 
 * This ensures that accessing type-specific properties is only allowed 
 * when the type has been verified, preventing runtime errors.
 */
export type BrushSettings =
    | RaiseSettings
    | LowerSettings
    | SmoothSettings
    | FlattenSettings
    | NoiseSettings
    | ErodeSettings;

export interface BrushOperation {
    position: GeoCoordinates;
    settings: BrushSettings;
}

/** 
 * Type predicate functions for runtime type checking of BrushSettings
 * 
 * These functions implement TypeScript's type predicate feature, allowing
 * runtime validation of union types. When these functions return true,
 * TypeScript narrows the type of the parameter to the specific type.
 * 
 * For example:
 * 
 * ```typescript
 * if (isSmoothSettings(settings)) {
 *   // TypeScript now knows settings is SmoothSettings
 *   console.log(settings.strength); // Safe to access strength property
 * }
 * ```
 */

/** 
 * Checks if the provided settings are RaiseSettings
 * @param settings - The brush settings to check
 * @returns True if settings is RaiseSettings, false otherwise
 */
export function isRaiseSettings(settings: BrushSettings): settings is RaiseSettings {
    return settings.type === BrushType.RAISE;
}

/** 
 * Checks if the provided settings are LowerSettings
 * @param settings - The brush settings to check
 * @returns True if settings is LowerSettings, false otherwise
 */
export function isLowerSettings(settings: BrushSettings): settings is LowerSettings {
    return settings.type === BrushType.LOWER;
}

/** 
 * Checks if the provided settings are SmoothSettings
 * @param settings - The brush settings to check
 * @returns True if settings is SmoothSettings, false otherwise
 */
export function isSmoothSettings(settings: BrushSettings): settings is SmoothSettings {
    return settings.type === BrushType.SMOOTH;
}

/** 
 * Checks if the provided settings are FlattenSettings
 * @param settings - The brush settings to check
 * @returns True if settings is FlattenSettings, false otherwise
 */
export function isFlattenSettings(settings: BrushSettings): settings is FlattenSettings {
    return settings.type === BrushType.FLATTEN;
}

/** 
 * Checks if the provided settings are NoiseSettings
 * @param settings - The brush settings to check
 * @returns True if settings is NoiseSettings, false otherwise
 */
export function isNoiseSettings(settings: BrushSettings): settings is NoiseSettings {
    return settings.type === BrushType.NOISE;
}

/** 
 * Checks if the provided settings are ErodeSettings
 * @param settings - The brush settings to check
 * @returns True if settings is ErodeSettings, false otherwise
 */
export function isErodeSettings(settings: BrushSettings): settings is ErodeSettings {
    return settings.type === BrushType.ERODE;
}
