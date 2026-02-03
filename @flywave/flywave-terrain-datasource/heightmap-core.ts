/**
 * Heightmap Generation Core System
 * Implements the complete workflow from brush operations to final elevation map
 */

/**
 * Represents a heightmap with width, height, and height data
 */
export interface Heightmap {
    /** Width of the heightmap in pixels */
    width: number;
    /** Height of the heightmap in pixels */
    height: number;
    /** Height values as 0-255 range Uint8Array */
    data: Uint8Array;
}

/**
 * Brush operation types
 */
export enum BrushType {
    RAISE = "raise", // Raise terrain
    LOWER = "lower", // Lower terrain
    SMOOTH = "smooth", // Smooth terrain
    FLATTEN = "flatten", // Flatten to target height
    NOISE = "noise", // Add noise details
    ERODE = "erode" // Erosion simulation
}

/**
 * Brush texture types for different brush shapes
 */
export type BrushTexture = "circle" | "square" | "diamond" | "soft" | "custom";

/**
 * Configuration for brush settings
 */
export interface BrushSettings {
    /** Type of brush operation */
    type: BrushType;
    /** Brush size in pixels */
    size: number;
    /** Brush strength (0.0-1.0) */
    strength: number;
    /** Brush hardness (0.0-1.0) - controls edge softness */
    hardness: number;
    /** Optional brush texture */
    texture?: BrushTexture;
    /** Target height for flatten operation (0.0-1.0) */
    flattenTargetHeight?: number;
    /** Scale factor for noise brush */
    noiseScale?: number;
    /** Persistence factor for noise brush */
    noisePersistence?: number;
}

/**
 * Represents a single brush operation
 */
export interface BrushOperation {
    /** X coordinate of operation center */
    x: number;
    /** Y coordinate of operation center */
    y: number;
    /** Brush settings for this operation */
    settings: BrushSettings;
}

/**
 * Noise generator for procedural terrain details
 */
class NoiseGenerator {
    private seed: number;

    /**
     * Creates a new NoiseGenerator instance
     * @param seed - Random seed for noise generation
     */
    constructor(seed: number = 1) {
        this.seed = seed;
    }

    /**
     * Generates a random number using the seed
     * @returns Random number between 0 and 1
     */
    private random(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    /**
     * Generates simple random noise
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Random noise value between 0 and 1
     */
    public randomNoise(x: number, y: number): number {
        return this.random();
    }

    /**
     * Generates simplified Perlin noise
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param scale - Scale factor for noise
     * @returns Noise value between 0 and 1
     */
    public perlinNoise(x: number, y: number, scale: number = 1): number {
        const scaledX = x / scale;
        const scaledY = y / scale;

        // Generate grid point values using pseudo-random function
        const gridX = Math.floor(scaledX);
        const gridY = Math.floor(scaledY);

        const fracX = scaledX - gridX;
        const fracY = scaledY - gridY;

        // Use smooth interpolation
        const u = this.fade(fracX);
        const v = this.fade(fracY);

        // Simplified: use random values as grid points
        const a = this.hash(gridX, gridY);
        const b = this.hash(gridX + 1, gridY);
        const c = this.hash(gridX, gridY + 1);
        const d = this.hash(gridX + 1, gridY + 1);

        // Bilinear interpolation
        return this.lerp(this.lerp(a, b, u), this.lerp(c, d, u), v);
    }

    /**
     * Smooth interpolation function
     * @param t - Value to interpolate (0-1)
     * @returns Smoothly interpolated value
     */
    private fade(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    /**
     * Linear interpolation function
     * @param a - First value
     * @param b - Second value
     * @param t - Interpolation factor (0-1)
     * @returns Interpolated value
     */
    private lerp(a: number, b: number, t: number): number {
        return a + t * (b - a);
    }

    /**
     * Simple hash function for grid coordinates
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Hash value between 0 and 1
     */
    private hash(x: number, y: number): number {
        const hash = x * 12.9898 + y * 78.233;
        return Math.abs(Math.sin(hash) * 43758.5453) % 1;
    }
}

/**
 * Core brush engine that applies brush operations to heightmaps
 */
export class BrushEngine {
    private noiseGen: NoiseGenerator;

    /**
     * Creates a new BrushEngine instance
     * @param seed - Random seed for noise generation
     */
    constructor(seed: number = 1) {
        this.noiseGen = new NoiseGenerator(seed);
    }

    /**
     * Applies a single brush operation to a heightmap
     * @param heightmap - The source heightmap
     * @param operation - The brush operation to apply
     * @returns New heightmap with the operation applied
     */
    public applyBrushOperation(heightmap: Heightmap, operation: BrushOperation): Heightmap {
        const { x, y, settings } = operation;
        const { type, size, strength, hardness } = settings;

        const radius = Math.floor(size / 2);
        const output = this.cloneHeightmap(heightmap);

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const pixelX = Math.floor(x + dx);
                const pixelY = Math.floor(y + dy);

                // Check boundaries
                if (
                    pixelX < 0 ||
                    pixelX >= heightmap.width ||
                    pixelY < 0 ||
                    pixelY >= heightmap.height
                ) {
                    continue;
                }

                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > radius) continue;

                // Calculate brush weight
                const normalizedDistance = distance / radius;
                let weight = this.calculateBrushWeight(normalizedDistance, hardness);

                // Get current height value (0.0-1.0 range)
                const currentHeight = output.data[pixelY * output.width + pixelX] / 255;
                let newHeight = currentHeight;

                // Apply different operations based on brush type
                switch (type) {
                    case BrushType.RAISE:
                        newHeight = this.applyRaise(currentHeight, weight, strength);
                        break;
                    case BrushType.LOWER:
                        newHeight = this.applyLower(currentHeight, weight, strength);
                        break;
                    case BrushType.SMOOTH:
                        newHeight = this.applySmooth(output, pixelX, pixelY, radius, strength);
                        break;
                    case BrushType.FLATTEN:
                        const targetHeight = settings.flattenTargetHeight || 0.5;
                        newHeight = this.applyFlatten(
                            currentHeight,
                            targetHeight,
                            weight,
                            strength
                        );
                        break;
                    case BrushType.NOISE:
                        const noiseScale = settings.noiseScale || 10;
                        const noisePersistence = settings.noisePersistence || 0.5;
                        newHeight = this.applyNoise(
                            currentHeight,
                            this.noiseGen.perlinNoise(pixelX, pixelY, noiseScale),
                            weight,
                            strength,
                            noisePersistence
                        );
                        break;
                    case BrushType.ERODE:
                        newHeight = this.applyErosion(output, pixelX, pixelY, weight, strength);
                        break;
                }

                // Ensure height value is within valid range
                newHeight = Math.max(0, Math.min(1, newHeight));

                // Update heightmap data
                output.data[pixelY * output.width + pixelX] = Math.round(newHeight * 255);
            }
        }

        return output;
    }

    /**
     * Calculates brush weight based on distance and hardness
     * @param normalizedDistance - Distance from center normalized to 0-1 range
     * @param hardness - Brush hardness (0.0-1.0)
     * @returns Weight value between 0 and 1
     */
    private calculateBrushWeight(normalizedDistance: number, hardness: number): number {
        // Use hardness-based attenuation function
        // Hardness 0 = soft brush (soft edges), Hardness 1 = hard brush (sharp edges)
        const hardnessFactor = 1 - hardness;
        const softness = 0.2 + hardnessFactor * 0.8; // Adjust soft/hard ratio

        if (normalizedDistance >= 1) return 0;

        // Use smooth attenuation function
        let weight = 1 - normalizedDistance / softness;
        weight = Math.max(0, Math.min(1, weight));

        // Apply smooth function
        weight = weight * weight * (3 - 2 * weight); // Smooth interpolation

        return weight;
    }

    /**
     * Applies raise operation to current height
     * @param currentHeight - Current height value (0.0-1.0)
     * @param weight - Brush weight factor
     * @param strength - Brush strength factor
     * @returns New height value after raising
     */
    private applyRaise(currentHeight: number, weight: number, strength: number): number {
        return currentHeight + weight * strength;
    }

    /**
     * Applies lower operation to current height
     * @param currentHeight - Current height value (0.0-1.0)
     * @param weight - Brush weight factor
     * @param strength - Brush strength factor
     * @returns New height value after lowering
     */
    private applyLower(currentHeight: number, weight: number, strength: number): number {
        return currentHeight - weight * strength;
    }

    /**
     * Applies smoothing operation to current height
     * @param heightmap - The heightmap to operate on
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param radius - Brush radius
     * @param strength - Smoothing strength
     * @returns New height value after smoothing
     */
    private applySmooth(
        heightmap: Heightmap,
        x: number,
        y: number,
        radius: number,
        strength: number
    ): number {
        let sum = 0;
        let count = 0;

        // Calculate neighborhood average
        const searchRadius = Math.min(radius, 3); // Limit search radius for performance

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx >= 0 && nx < heightmap.width && ny >= 0 && ny < heightmap.height) {
                    const height = heightmap.data[ny * heightmap.width + nx] / 255;
                    sum += height;
                    count++;
                }
            }
        }

        if (count === 0) return heightmap.data[y * heightmap.width + x] / 255;

        const averageHeight = sum / count;
        // Transition current height toward average
        return (
            (heightmap.data[y * heightmap.width + x] / 255) * (1 - strength) +
            averageHeight * strength
        );
    }

    /**
     * Applies flatten operation to current height
     * @param currentHeight - Current height value (0.0-1.0)
     * @param targetHeight - Target height to flatten to (0.0-1.0)
     * @param weight - Brush weight factor
     * @param strength - Brush strength factor
     * @returns New height value after flattening
     */
    private applyFlatten(
        currentHeight: number,
        targetHeight: number,
        weight: number,
        strength: number
    ): number {
        // Transition toward target height
        const blendFactor = weight * strength;
        return currentHeight * (1 - blendFactor) + targetHeight * blendFactor;
    }

    /**
     * Applies noise operation to current height
     * @param currentHeight - Current height value (0.0-1.0)
     * @param noiseValue - Noise value (0.0-1.0)
     * @param weight - Brush weight factor
     * @param strength - Brush strength factor
     * @param persistence - Noise persistence factor
     * @returns New height value after adding noise
     */
    private applyNoise(
        currentHeight: number,
        noiseValue: number,
        weight: number,
        strength: number,
        persistence: number
    ): number {
        // Noise value range is 0-1, convert to -0.5 to 0.5
        const adjustedNoise = (noiseValue - 0.5) * 2 * persistence;
        return currentHeight + weight * strength * adjustedNoise;
    }

    /**
     * Applies erosion simulation operation to current height
     * @param heightmap - The heightmap to operate on
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param weight - Brush weight factor
     * @param strength - Erosion strength factor
     * @returns New height value after erosion simulation
     */
    private applyErosion(
        heightmap: Heightmap,
        x: number,
        y: number,
        weight: number,
        strength: number
    ): number {
        // Simplified erosion algorithm: transition height toward neighborhood average
        let sum = 0;
        let count = 0;

        // Check heights in 8 surrounding directions
        const directions = [
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [0, -1],
            [0, 1],
            [1, -1],
            [1, 0],
            [1, 1]
        ];

        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < heightmap.width && ny >= 0 && ny < heightmap.height) {
                const height = heightmap.data[ny * heightmap.width + nx] / 255;
                sum += height;
                count++;
            }
        }

        if (count === 0) return heightmap.data[y * heightmap.width + x] / 255;

        const averageHeight = sum / count;
        const currentHeightValue = heightmap.data[y * heightmap.width + x] / 255;

        // If current point is higher than average, erode downward; if lower, fill upward
        let erosionFactor = strength * weight;
        if (currentHeightValue > averageHeight) {
            return currentHeightValue - erosionFactor * (currentHeightValue - averageHeight);
        } else {
            return currentHeightValue + erosionFactor * (averageHeight - currentHeightValue);
        }
    }

    /**
     * Creates a copy of the heightmap
     * @param heightmap - The heightmap to clone
     * @returns New heightmap with copied data
     */
    private cloneHeightmap(heightmap: Heightmap): Heightmap {
        return {
            width: heightmap.width,
            height: heightmap.height,
            data: new Uint8Array(heightmap.data)
        };
    }
}

/**
 * Heightmap generator that creates heightmaps from brush operations
 */
export class HeightmapGenerator {
    private brushEngine: BrushEngine;

    /**
     * Creates a new HeightmapGenerator instance
     * @param seed - Random seed for noise generation
     */
    constructor(seed: number = 1) {
        this.brushEngine = new BrushEngine(seed);
    }

    /**
     * Generates a heightmap from multiple brush operations
     * @param width - Width of the heightmap
     * @param height - Height of the heightmap
     * @param operations - Array of brush operations to apply
     * @param options - Generation options
     * @returns Generated heightmap
     */
    public generateHeightmap(
        width: number,
        height: number,
        operations: BrushOperation[],
        options?: {
            /** Initial height (0.0-1.0) */
            initialHeight?: number;
            /** Whether to add base noise */
            baseNoise?: boolean;
            /** Scale for base noise */
            baseNoiseScale?: number;
        }
    ): Heightmap {
        // Create initial heightmap
        const initialHeight = options?.initialHeight ?? 0.5;
        const initialData = new Uint8Array(width * height);
        initialData.fill(Math.round(initialHeight * 255));

        const heightmap: Heightmap = {
            width,
            height,
            data: initialData
        };

        // Add base noise if needed
        if (options?.baseNoise) {
            const noiseScale = options.baseNoiseScale ?? 50;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const noiseValue = this.brushEngine["noiseGen"].perlinNoise(x, y, noiseScale);
                    const currentValue = heightmap.data[y * width + x] / 255;
                    const newValue = currentValue + (noiseValue - 0.5) * 0.1; // Add small amplitude noise
                    heightmap.data[y * width + x] = Math.round(
                        Math.max(0, Math.min(1, newValue)) * 255
                    );
                }
            }
        }

        // Apply all brush operations in sequence
        let currentHeightmap = heightmap;
        for (const operation of operations) {
            currentHeightmap = this.brushEngine.applyBrushOperation(currentHeightmap, operation);
        }

        return currentHeightmap;
    }

    /**
     * Generates a Canvas representation of the heightmap for visualization
     * @param heightmap - The heightmap to convert to canvas
     * @returns HTMLCanvasElement with heightmap visualization
     */
    public generateCanvas(heightmap: Heightmap): HTMLCanvasElement {
        // Check if running in browser environment
        if (typeof document === "undefined") {
            // In Node.js environment, create a mock canvas object
            // Actual image processing will be done in canvas-supported environment
            const canvas = {
                width: heightmap.width,
                height: heightmap.height,
                getContext: () => null
            } as unknown as HTMLCanvasElement;
            return canvas;
        }

        const canvas = document.createElement("canvas");
        canvas.width = heightmap.width;
        canvas.height = heightmap.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Cannot get 2D canvas context");
        }

        const imageData = ctx.createImageData(heightmap.width, heightmap.height);
        const data = imageData.data;

        for (let i = 0; i < heightmap.data.length; i++) {
            const heightValue = heightmap.data[i];
            // Convert height value to grayscale
            data[i * 4] = heightValue; // R
            data[i * 4 + 1] = heightValue; // G
            data[i * 4 + 2] = heightValue; // B
            data[i * 4 + 3] = 255; // A
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /**
     * Exports heightmap to data URL (PNG format)
     * @param heightmap - The heightmap to export
     * @param format - Image format ('png' or 'webp')
     * @param quality - Image quality (0.0-1.0) for webp format
     * @returns Data URL string of the heightmap image
     */
    public exportToDataURL(
        heightmap: Heightmap,
        format: "png" | "webp" = "png",
        quality: number = 0.92
    ): string {
        // Check if running in browser environment
        if (typeof document === "undefined") {
            // In Node.js environment, return a simple representation of heightmap data
            // Actual image generation will be done in canvas-supported environment
            return `heightmap-data:${heightmap.width}x${heightmap.height}:${heightmap.data.length}`;
        }

        const canvas = this.generateCanvas(heightmap);
        return canvas.toDataURL(`image/${format}`, quality);
    }
}

/**
 * Example usage of the heightmap generator
 * @returns Generated heightmap example
 */
export function example(): Heightmap {
    // Create heightmap generator
    const generator = new HeightmapGenerator(12345);

    // Define brush operation sequence
    const operations: BrushOperation[] = [
        // Create base terrain
        {
            x: 50,
            y: 50,
            settings: {
                type: BrushType.RAISE,
                size: 100,
                strength: 0.3,
                hardness: 0.5
            }
        },
        // Add details
        {
            x: 70,
            y: 70,
            settings: {
                type: BrushType.NOISE,
                size: 50,
                strength: 0.2,
                hardness: 0.3,
                noiseScale: 10,
                noisePersistence: 0.7
            }
        },
        // Smooth processing
        {
            x: 60,
            y: 60,
            settings: {
                type: BrushType.SMOOTH,
                size: 80,
                strength: 0.4,
                hardness: 0.6
            }
        },
        // Flatten low-lying areas
        {
            x: 30,
            y: 30,
            settings: {
                type: BrushType.FLATTEN,
                size: 60,
                strength: 0.5,
                hardness: 0.4,
                flattenTargetHeight: 0.3
            }
        }
    ];

    // Generate heightmap (256x256)
    const heightmap = generator.generateHeightmap(256, 256, operations, {
        initialHeight: 0.3, // Initial height 30%
        baseNoise: true, // Add base noise
        baseNoiseScale: 30
    });

    return heightmap;
}
