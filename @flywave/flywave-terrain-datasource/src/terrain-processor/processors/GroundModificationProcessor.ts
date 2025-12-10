/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type GeoCoordinates,
    GeoLineString,
    GeoPolygon
} from "@flywave/flywave-geoutils";
import Kriging, { type Variogram } from "@flywave/flywave-kriging-gl";
import * as THREE from "three";

import {
    type GroundModificationOptions,
    type GroundModificationPolygon,
    type HeightOperationType,
    type VertexSourceType
} from "../../ground-modification-manager";
import { GROUND_MODIFICATION_HEIGHT, GROUND_MODIFICATION_WIDTH } from "../constants";
import { type RenderEnvironment, getGlobalRenderEnvironment } from "../core/RenderEnvironment";
import { type GroundModificationResult, type RenderOptions } from "../core/types";
import { GroundModificationHeightShader } from "../shaders/GroundModificationHeightShader";
import { GeometryUtils } from "../utils/geometry-utils";
import { TextureUtils } from "../utils/texture-utils";

/**
 * Ground modification processor class
 *
 * This class is responsible for rendering ground modification height maps.
 * It handles complex terrain modifications using kriging interpolation and
 * specialized shaders to create realistic elevation changes.
 */
export class GroundModificationProcessor {
    /** The rendering environment to use for modification generation */
    private environment?: RenderEnvironment;

    /**
     * Creates a new ground modification processor
     *
     * @param environment - Optional rendering environment to use
     */
    constructor(environment?: RenderEnvironment) {
        this.environment = environment;
    }

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
    renderHeightMap(
        modifications: GroundModificationPolygon[],
        tileGeoBox: GeoBox,
        baseDemTexture: THREE.Texture | undefined,
        krigingOptions?: GroundModificationOptions,
        options: RenderOptions = {}
    ): GroundModificationResult {
        const {
            width = GROUND_MODIFICATION_WIDTH,
            height = GROUND_MODIFICATION_HEIGHT,
            flipY = true
        } = options;

        const renderEnv = this.environment || getGlobalRenderEnvironment();
        renderEnv.clearScene();

        if (flipY) {
            renderEnv.setupCamera(0, width, 0, height);
        } else {
            renderEnv.setupCamera(0, width, height, 0);
        }

        return this.renderInternal(
            modifications,
            tileGeoBox,
            baseDemTexture,
            krigingOptions,
            width,
            height,
            flipY
        );
    }

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
    private renderInternal(
        modifications: GroundModificationPolygon[],
        tileGeoBox: GeoBox,
        baseDemTexture: THREE.Texture | undefined,
        krigingOptions: GroundModificationOptions | undefined,
        width: number,
        height: number,
        flipY: boolean
    ): GroundModificationResult {
        const renderEnv = this.environment || getGlobalRenderEnvironment();

        // 设置基础DEM纹理
        const baseTextureUniform = baseDemTexture
            ? baseDemTexture.clone()
            : TextureUtils.createDefaultBaseTexture(width, height, flipY);

        // 准备修改轮廓和克里金点
        const { modificationContours, krigingPoints } = this.prepareModificationData(modifications);

        // 生成克里金纹理
        const krigingTexture = this.generateKrigingTexture(
            krigingPoints,
            tileGeoBox,
            width,
            height,
            krigingOptions
        );

        // 创建基础几何体
        const { geometry, position } = GeometryUtils.createBoxGeometry(
            tileGeoBox,
            tileGeoBox,
            width,
            height
        );

        const templateTextures: Array<THREE.Texture | THREE.WebGLRenderTarget> = [
            baseTextureUniform,
            krigingTexture.texture
        ];

        // 为每个修改创建网格
        modifications.forEach((modification, index) => {
            const contour = modificationContours[modification.id];
            this.createModificationMesh(
                modification,
                contour,
                tileGeoBox,
                width,
                height,
                geometry,
                position,
                baseTextureUniform,
                krigingTexture.texture,
                renderEnv,
                templateTextures,
                index
            );
        });

        // 执行渲染
        const data = renderEnv.render(width, height);
        const imageData = new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height);

        // 清理临时纹理
        this.disposeTextures(templateTextures);

        return {
            image: imageData,
            krigingPoints,
            variogram: krigingTexture.variogram
        };
    }

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
    private prepareModificationData(modifications: GroundModificationPolygon[]): {
        modificationContours: Record<string, GeoCoordinates[]>;
        krigingPoints: GeoCoordinates[];
    } {
        const modificationContours: Record<string, GeoCoordinates[]> = {};
        const krigingPoints: GeoCoordinates[] = [];

        modifications.forEach(modification => {
            const contour = GeometryUtils.createGeoAreaShape(modification);
            modificationContours[modification.id] = contour;

            if (modification.geoArea instanceof GeoLineString) {
                // 循环生成从1.2开始向内收缩的平行线
                const widthFactors = [1.2, 1.0, 0.8, 0.6, 0.4, 0.2];
                for (const factor of widthFactors) {
                    const parallelLines = modification.geoArea.toPolygon({
                        widthFactor: factor
                    });
                    krigingPoints.push(
                        ...(parallelLines.coordinates as unknown as GeoCoordinates[])
                    );
                }
            } else {
                krigingPoints.push(...contour);
            }
        });

        return { modificationContours, krigingPoints };
    }

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
    private generateKrigingTexture(
        krigingPoints: GeoCoordinates[],
        tileGeoBox: GeoBox,
        width: number,
        height: number,
        krigingOptions?: GroundModificationOptions
    ): { texture: THREE.Texture; variogram: Variogram } {
        const lngData = krigingPoints.map(point => point.lng);
        const latData = krigingPoints.map(point => point.lat);
        const altData = krigingPoints.map(point => point.altitude || 0);

        // 使用可选的克里金参数，如果未提供则使用默认值
        const model = krigingOptions?.model || "exponential";
        const sigma2 = krigingOptions?.sigma2 !== undefined ? krigingOptions.sigma2 : 20;
        const alpha = krigingOptions?.alpha !== undefined ? krigingOptions.alpha : 0.05;

        const variogram = Kriging.train(altData, lngData, latData, model, sigma2, alpha);
        const renderEnv = this.environment || getGlobalRenderEnvironment();

        const krigingTexture = Kriging.dem(
            variogram,
            {
                minX: tileGeoBox.west,
                minY: tileGeoBox.south,
                maxX: tileGeoBox.east,
                maxY: tileGeoBox.north
            },
            width,
            height,
            "mapbox",
            renderEnv.getRenderer()
        );

        return { texture: krigingTexture.texture, variogram };
    }

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
    private createModificationMesh(
        modification: GroundModificationPolygon,
        contour: GeoCoordinates[],
        tileGeoBox: GeoBox,
        width: number,
        height: number,
        geometry: THREE.BufferGeometry,
        position: THREE.Vector3,
        baseTextureUniform: THREE.Texture,
        krigingTexture: THREE.Texture,
        renderEnv: RenderEnvironment,
        templateTextures: Array<THREE.Texture | THREE.WebGLRenderTarget>,
        renderOrder: number
    ): void {
        const krigingMaskTexture = TextureUtils.renderMaskPolygonWithDistanceGPU(
            contour,
            tileGeoBox,
            width,
            height,
            renderEnv,
            modification
        );

        const material = new GroundModificationHeightShader();
        material.uniforms.altitude.value = modification.depthOrHeight || 0;
        material.uniforms.vertexSourceType.value = this.vertexSourceTypeToShaderValue(
            modification.type.vertexSource
        );
        material.uniforms.heightOperation.value = this.heightOperationTypeToShaderValue(
            modification.type.heightOperation
        );
        material.uniforms.baseDemTexture.value = baseTextureUniform;
        material.uniforms.krigingTexture.value = krigingTexture;
        material.uniforms.krigingMaskTexture.value = krigingMaskTexture.renderTarget?.texture;
        material.uniforms.distanceTexture.value = krigingMaskTexture.distanceTexture;

        if (krigingMaskTexture.renderTarget) {
            templateTextures.push(krigingMaskTexture.renderTarget);
        }
        templateTextures.push(krigingMaskTexture.distanceTexture);

        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, 0);
        mesh.renderOrder = renderOrder;

        renderEnv.getScene().add(mesh);
    }

    /**
     * Disposes of temporary texture resources
     *
     * This method cleans up temporary textures created during the rendering
     * process to prevent memory leaks and ensure efficient resource usage.
     *
     * @param textures - Array of textures to dispose
     */
    private disposeTextures(textures: Array<THREE.Texture | THREE.WebGLRenderTarget>): void {
        textures.forEach(texture => {
            texture.dispose();
        });
    }

    /**
     * Converts VertexSourceType to shader integer value
     *
     * This method maps vertex source types to integer values that can be
     * used in shader uniforms to control how vertex data is sourced.
     *
     * @param vertexSource - The vertex source type to convert
     * @returns Integer value representing the vertex source type
     */
    private vertexSourceTypeToShaderValue(vertexSource: VertexSourceType): number {
        switch (vertexSource) {
            case "fixed":
                return 0;
            case "geometry":
                return 1;
            default:
                return 0;
        }
    }

    /**
     * Converts HeightOperationType to shader integer value
     *
     * This method maps height operation types to integer values that can be
     * used in shader uniforms to control how height modifications are applied.
     *
     * @param operation - The height operation type to convert
     * @returns Integer value representing the height operation type
     */
    private heightOperationTypeToShaderValue(operation: HeightOperationType): number {
        switch (operation) {
            case "replace":
                return 0;
            case "add":
                return 1;
            case "subtract":
                return 2;
            case "max":
                return 3;
            case "min":
                return 4;
            default:
                return 0;
        }
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
export function renderGroundModificationHeightMap(
    modifications: GroundModificationPolygon[],
    tileGeoBox: GeoBox,
    baseDemTexture: THREE.Texture | undefined,
    width: number = 512,
    height: number = 512,
    flipY: boolean = true,
    krigingOptions?: GroundModificationOptions
): GroundModificationResult {
    const processor = new GroundModificationProcessor();
    return processor.renderHeightMap(modifications, tileGeoBox, baseDemTexture, krigingOptions, {
        width,
        height,
        flipY
    });
}
