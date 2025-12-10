/* Copyright (C) 2025 flywave.gl contributors */

import { type BufferGeometry, Mesh } from "three";

import { HEIGHT_MAP_HEIGHT, HEIGHT_MAP_WIDTH } from "../constants";
import { type RenderEnvironment, getGlobalRenderEnvironment } from "../core/RenderEnvironment";
import { type RenderOptions } from "../core/types";
import { HeightMapShader } from "../shaders/HeightMapShader";

/**
 * Height map processor class
 *
 * This class is responsible for rendering height maps from geometric data.
 * It uses specialized shaders to encode elevation information into texture
 * data that can be used for terrain visualization.
 */
export class HeightMapProcessor {
    /** The rendering environment to use for height map generation */
    private environment?: RenderEnvironment;

    /**
     * Creates a new height map processor
     *
     * @param environment - Optional rendering environment to use
     */
    constructor(environment?: RenderEnvironment) {
        this.environment = environment;
    }

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
    renderFromGeometry(
        geometry: BufferGeometry,
        vertexShaderType: "quantized" | "stratum" = "quantized",
        options: RenderOptions = {}
    ): ImageData {
        const { width = HEIGHT_MAP_WIDTH, height = HEIGHT_MAP_HEIGHT } = options;
        const renderEnv = this.environment || getGlobalRenderEnvironment();

        renderEnv.clearScene();

        const shader = new HeightMapShader(vertexShaderType);
        const mesh = new Mesh(geometry, shader);
        mesh.frustumCulled = false;
        renderEnv.getScene().add(mesh);

        const data = renderEnv.render(width, height);
        return new ImageData(data, width, height);
    }

    /**
     * Sets the rendering environment
     *
     * @param environment - The rendering environment to use
     */
    setEnvironment(environment: RenderEnvironment): void {
        this.environment = environment;
    }

    /**
     * Gets the current rendering environment
     *
     * @returns The current rendering environment or undefined if not set
     */
    getEnvironment(): RenderEnvironment | undefined {
        return this.environment;
    }
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
export function renderHeightMap(
    geometry: BufferGeometry,
    environment?: RenderEnvironment,
    vertexShaderType: "quantized" | "stratum" = "quantized",
    options: RenderOptions = {}
): ImageData {
    const processor = new HeightMapProcessor(environment);
    return processor.renderFromGeometry(geometry, vertexShaderType, options);
}
