import { type BufferGeometry } from "three";
import { type RenderEnvironment } from "../core/RenderEnvironment";
import { type RenderOptions } from "../core/types";
/**
 * Height map processor class
 *
 * This class is responsible for rendering height maps from geometric data.
 * It uses specialized shaders to encode elevation information into texture
 * data that can be used for terrain visualization.
 */
export declare class HeightMapProcessor {
    /** The rendering environment to use for height map generation */
    private environment?;
    /**
     * Creates a new height map processor
     *
     * @param environment - Optional rendering environment to use
     */
    constructor(environment?: RenderEnvironment);
    /**
     * Renders a height map from geometric data
     *
     * This method takes a buffer geometry and renders it as a height map
     * using specialized shaders. The resulting image data encodes elevation
     * information that can be used for terrain visualization.
     *
     * @param geometry - The buffer geometry to render as a height map
     * @param vertexShaderType - The type of vertex shader to use ("quantized" or "stratum")
     * @param options - Rendering options including width and height
     * @returns ImageData containing the encoded height map
     */
    renderFromGeometry(geometry: BufferGeometry, vertexShaderType?: "quantized" | "stratum", options?: RenderOptions): ImageData;
    /**
     * Sets the rendering environment
     *
     * @param environment - The rendering environment to use
     */
    setEnvironment(environment: RenderEnvironment): void;
    /**
     * Gets the current rendering environment
     *
     * @returns The current rendering environment or undefined if not set
     */
    getEnvironment(): RenderEnvironment | undefined;
}
/**
 * Function-style height map rendering
 *
 * This function provides a convenient way to render height maps without
 * explicitly creating a HeightMapProcessor instance. It creates a temporary
 * processor and uses it to render the height map.
 *
 * @param geometry - The buffer geometry to render as a height map
 * @param environment - Optional rendering environment instance to use
 * @param vertexShaderType - The type of vertex shader to use ("quantized" or "stratum")
 * @param options - Rendering options including width and height
 * @returns ImageData containing the encoded height map
 */
export declare function renderHeightMap(geometry: BufferGeometry, environment?: RenderEnvironment, vertexShaderType?: "quantized" | "stratum", options?: RenderOptions): ImageData;
