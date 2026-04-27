import { type GeoBox, GeoBox as GeoBoxType, GeoCoordinates } from "@flywave/flywave-geoutils";
import { type RenderEnvironment } from "../core/RenderEnvironment";
import { type DistanceTextureResult } from "../core/types";
import * as THREE from "three";
import { GroundModificationPolygon } from "../../ground-modification-manager";
/**
 * Texture utilities class
 *
 * Provides utility methods for texture processing, including creating base textures and rendering mask textures.
 */
export declare class TextureUtils {
    /**
     * Creates a default base texture
     *
     * Creates a default base texture for terrain rendering.
     *
     * @param width - Texture width
     * @param height - Texture height
     * @param flipY - Whether to flip the Y axis
     * @returns Base texture
     */
    static createDefaultBaseTexture(width: number, height: number, flipY: boolean): THREE.Texture;
    /**
     * Renders polygon mask and calculates distance using GPU
     *
     * Uses GPU shaders to render a polygon mask and calculate the distance from each pixel to the polygon boundary.
     *
     * @param polygonCoords - Polygon coordinates
     * @param geoBox - Geographic bounding box
     * @param width - Texture width
     * @param height - Texture height
     * @param renderEnv - Render environment
     * @param modification - Ground modification object (for getting additional parameters)
     * @returns Distance texture result
     */
    static renderMaskPolygonWithDistanceGPU(polygonCoords: GeoCoordinates[], geoBox: GeoBoxType, width: number, height: number, renderEnv: RenderEnvironment, modification: GroundModificationPolygon): DistanceTextureResult;
    /**
     * Renders polygon mask
     *
     * Renders a polygon mask to a texture.
     *
     * @param polygonCoords - Polygon coordinates
     * @param geoBox - Geographic bounding box
     * @param width - Texture width
     * @param height - Texture height
     * @param renderEnv - Render environment
     * @returns Render target
     */
    static renderMaskPolygon(polygonCoords: GeoCoordinates[], geoBox: GeoBox, width: number, height: number, renderEnv: RenderEnvironment): {
        renderTarget: THREE.WebGLRenderTarget;
    };
    /**
     * Calculates distance to line segment
     *
     * Calculates the shortest distance from a point to a line segment.
     *
     * @param point - Point coordinates
     * @param start - Line segment start point
     * @param end - Line segment end point
     * @returns Distance value
     */
    static calculateDistanceToPolygonEdge(point: GeoCoordinates, polygon: GeoCoordinates[]): number;
    /**
     * Calculates polygon mask and distance using GPU (new method)
     *
     * Uses GPU shaders to simultaneously calculate polygon mask and distance field.
     *
     * @param polygonCoords - Polygon coordinates
     * @param geoBox - Geographic bounding box
     * @param width - Texture width
     * @param height - Texture height
     * @param renderEnv - Render environment
     * @param modification - Ground modification object
     * @returns Distance texture result
     */
    static renderMaskPolygonWithDistanceGPU2(polygonCoords: GeoCoordinates[], geoBox: GeoBoxType, width: number, height: number, renderEnv: RenderEnvironment, modification: any): DistanceTextureResult;
    /**
     * Creates contour data texture
     *
     * Encodes polygon contour coordinates into a texture for use by GPU shaders.
     *
     * @param polygonCoords - Polygon coordinates
     * @param width - Texture width
     * @param height - Texture height
     * @returns Texture and dimension information
     */
    static createContourTexture(polygonCoords: GeoCoordinates[], width: number, height: number): {
        texture: THREE.Texture;
        width: number;
        height: number;
    };
}
