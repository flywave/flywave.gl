import { type GeoBox } from "@flywave/flywave-geoutils";
import * as THREE from "three";
import { type GroundModificationOptions, type GroundModificationPolygon } from "../../ground-modification-manager";
import { type RenderEnvironment } from "../core/RenderEnvironment";
import { type GroundModificationResult, type RenderOptions } from "../core/types";
/**
 * Ground modification processor class
 *
 * This class is responsible for rendering ground modification height maps.
 * It handles complex terrain modifications using kriging interpolation and
 * specialized shaders to create realistic elevation changes.
 */
export declare class GroundModificationProcessor {
    /** The rendering environment to use for modification generation */
    private environment?;
    /**
     * Creates a new ground modification processor
     *
     * @param environment - Optional rendering environment to use
     */
    constructor(environment?: RenderEnvironment);
    /**
     * Renders a ground modification height map onto a map tile
     *
     * This method takes an array of ground modifications and renders them
     * as a height map that can be used to modify the base terrain elevation.
     * It uses kriging interpolation to create smooth transitions between
     * modified and unmodified areas.
     *
     * @param modifications - Array of ground modifications to apply
     * @param tileGeoBox - Geographic bounding box of the target tile
     * @param baseDemTexture - Optional base DEM texture to modify
     * @param krigingOptions - Optional kriging interpolation parameters
     * @param options - Rendering options including width, height, and Y-axis flipping
     * @returns Ground modification result including image data and kriging information
     */
    renderHeightMap(modifications: GroundModificationPolygon[], tileGeoBox: GeoBox, baseDemTexture: THREE.Texture | undefined, krigingOptions?: GroundModificationOptions, options?: RenderOptions): GroundModificationResult;
    /**
     * Internal rendering implementation
     *
     * This method handles the core rendering logic for ground modifications,
     * including preparing modification data, generating kriging textures,
     * creating meshes for each modification, and executing the final render.
     *
     * @param modifications - Array of ground modifications to apply
     * @param tileGeoBox - Geographic bounding box of the target tile
     * @param baseDemTexture - Optional base DEM texture to modify
     * @param krigingOptions - Optional kriging interpolation parameters
     * @param width - The rendering width
     * @param height - The rendering height
     * @param flipY - Whether to flip the Y axis during rendering
     * @returns Ground modification result including image data and kriging information
     */
    private renderInternal;
    /**
     * Prepares modification data for rendering
     *
     * This method processes the input modifications to extract contour
     * information and generate kriging interpolation points. For line
     * string modifications, it generates multiple parallel lines at
     * different width factors to create smooth transitions.
     *
     * @param modifications - Array of ground modifications to process
     * @returns Object containing modification contours and kriging points
     */
    private prepareModificationData;
    /**
     * Generates a kriging texture for smooth interpolation
     *
     * This method uses kriging interpolation to create a smooth transition
     * between modified and unmodified terrain areas. It trains a variogram
     * model on the input points and generates a texture representing the
     * interpolated elevation changes.
     *
     * @param krigingPoints - Array of geographic coordinates with elevation data
     * @param tileGeoBox - Geographic bounding box of the target tile
     * @param width - The texture width
     * @param height - The texture height
     * @param krigingOptions - Optional kriging interpolation parameters
     * @returns Object containing the kriging texture and trained variogram
     */
    private generateKrigingTexture;
    /**
     * Creates a mesh for a ground modification
     *
     * This method creates a Three.js mesh for a specific ground modification,
     * setting up the appropriate geometry, material, and uniforms based on
     * the modification's properties and the kriging interpolation data.
     *
     * @param modification - The ground modification to create a mesh for
     * @param contour - The geographic contour of the modification
     * @param tileGeoBox - Geographic bounding box of the target tile
     * @param width - The rendering width
     * @param height - The rendering height
     * @param geometry - The base geometry to use for the mesh
     * @param position - The position for the mesh
     * @param baseTextureUniform - The base DEM texture uniform
     * @param krigingTexture - The kriging texture uniform
     * @param renderEnv - The rendering environment to add the mesh to
     * @param templateTextures - Array of textures to add temporary textures to
     * @param renderOrder - The render order for the mesh
     */
    private createModificationMesh;
    /**
     * Disposes of temporary texture resources
     *
     * This method cleans up temporary textures created during the rendering
     * process to prevent memory leaks and ensure efficient resource usage.
     *
     * @param textures - Array of textures to dispose
     */
    private disposeTextures;
    /**
     * Converts VertexSourceType to shader integer value
     *
     * This method maps vertex source types to integer values that can be
     * used in shader uniforms to control how vertex data is sourced.
     *
     * @param vertexSource - The vertex source type to convert
     * @returns Integer value representing the vertex source type
     */
    private vertexSourceTypeToShaderValue;
    /**
     * Converts HeightOperationType to shader integer value
     *
     * This method maps height operation types to integer values that can be
     * used in shader uniforms to control how height modifications are applied.
     *
     * @param operation - The height operation type to convert
     * @returns Integer value representing the height operation type
     */
    private heightOperationTypeToShaderValue;
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
 * Renders a ground modification height map onto a map tile
 *
 * This function provides a convenient way to render ground modifications without
 * explicitly creating a GroundModificationProcessor instance. It creates a temporary
 * processor and uses it to render the modifications.
 *
 * @param modifications - Array of ground modifications to apply
 * @param tileGeoBox - Geographic bounding box of the target tile
 * @param baseDemTexture - Optional base DEM texture to modify
 * @param width - The rendering width (default: 512)
 * @param height - The rendering height (default: 512)
 * @param flipY - Whether to flip the Y axis during rendering (default: true)
 * @param krigingOptions - Optional kriging interpolation parameters
 * @returns Ground modification result including image data and kriging information
 */
export declare function renderGroundModificationHeightMap(modifications: GroundModificationPolygon[], tileGeoBox: GeoBox, baseDemTexture: THREE.Texture | undefined, width?: number, height?: number, flipY?: boolean, krigingOptions?: GroundModificationOptions): GroundModificationResult;
