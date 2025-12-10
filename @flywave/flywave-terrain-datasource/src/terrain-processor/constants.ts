/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Terrain processor module constant definitions
 *
 * This file contains constant values used throughout the terrain processing
 * system for consistent rendering dimensions and other configuration values.
 */

/**
 * Default rendering dimensions
 *
 * These constants define the default width and height for terrain rendering
 * operations when specific dimensions are not provided.
 */
export const DEFAULT_RENDER_WIDTH = 256;
export const DEFAULT_RENDER_HEIGHT = 256;

/**
 * Height map rendering dimensions
 *
 * These constants define the standard width and height for height map
 * rendering operations. Height maps are used to represent elevation data
 * for terrain visualization.
 */
export const HEIGHT_MAP_WIDTH = 256;
export const HEIGHT_MAP_HEIGHT = 256;

/**
 * Ground modification rendering dimensions
 *
 * These constants define the width and height for ground modification
 * rendering operations. Ground modifications require higher resolution
 * rendering to capture detailed changes to the terrain surface.
 */
export const GROUND_MODIFICATION_WIDTH = 512;
export const GROUND_MODIFICATION_HEIGHT = 512;
