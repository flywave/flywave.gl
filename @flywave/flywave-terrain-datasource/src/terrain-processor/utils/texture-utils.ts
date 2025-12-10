/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    GeoBox as GeoBoxType,
    GeoCoordinates
} from "@flywave/flywave-geoutils";
import { type RenderEnvironment } from "../core/RenderEnvironment";
import { type DistanceTextureResult } from "../core/types";
import { CoordinateUtils } from "./coordinate-utils";
import * as THREE from "three";
import { GroundModificationPolygon } from "../../ground-modification-manager";
import * as turf from '@turf/turf';
import earcut from "earcut";

// Shader code: Fragment shader that only renders the red channel
const singleChannelFragmentShader = `
precision highp float;
void main() {
    // Only output a single channel, where 1.0 indicates inside the polygon and 0.0 indicates outside
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`;

/**
 * Texture utilities class
 *
 * Provides utility methods for texture processing, including creating base textures and rendering mask textures.
 */
export class TextureUtils {
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
    static createDefaultBaseTexture(
        width: number,
        height: number,
        flipY: boolean
    ): THREE.Texture {
        // Create a simple gradient image data as the default base texture
        const size = width * height;
        const data = new Uint8ClampedArray(4 * size);

        for (let i = 0; i < size; i++) {
            const stride = i * 4;
            // Create a simple gradient from left to right, top to bottom
            const x = i % width;
            const y = Math.floor(i / width);
            const value = Math.floor((x / width) * 255);

            data[stride] = value;     // R
            data[stride + 1] = value; // G
            data[stride + 2] = value; // B
            data[stride + 3] = 255;   // A
        }

        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
        texture.flipY = flipY;
        texture.needsUpdate = true;
        return texture;
    }

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
    static renderMaskPolygonWithDistanceGPU(
        polygonCoords: GeoCoordinates[],
        geoBox: GeoBoxType,
        width: number,
        height: number,
        renderEnv: RenderEnvironment,
        modification: GroundModificationPolygon
    ): DistanceTextureResult {
        // First execute the original rendering
        const { renderTarget: maskRenderTarget } = this.renderMaskPolygon(
            polygonCoords,
            geoBox,
            width,
            height,
            renderEnv
        );

        // Read the rendering result
        const pixels = new Uint8Array(width * height);
        renderEnv.getRenderer().readRenderTargetPixels(
            maskRenderTarget!,
            0,
            0,
            width,
            height,
            pixels
        );

        // Create a new pixel data array (single channel floating point)
        const distanceData = new Float32Array(width * height);

        // Iterate through each pixel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Flip the Y axis because the image coordinate system and geographic coordinate system have opposite Y axis directions
                const flippedY = height - 1 - y;
                const index = y * width + x;
                const flippedIndex = flippedY * width + x;
                const value = pixels[flippedIndex]; // 获取红色通道的值

                // If the pixel value is 0, do not process
                if (value === 0) {
                    distanceData[index] = 0;
                    continue;
                }

                const lonRatio = x / width;
                const latRatio = y / height;

                const longitude = geoBox.west + lonRatio * (geoBox.east - geoBox.west);
                const latitude = geoBox.south + latRatio * (geoBox.north - geoBox.south);
                const pixelCoord = new GeoCoordinates(latitude, longitude);

                // Calculate the longitude and latitude distance from the current pixel to the edge of the input polygon
                const distance = this.calculateDistanceToPolygonEdge(
                    pixelCoord,
                    polygonCoords
                );

                distanceData[index] = Math.min(1.0, distance / modification.slopeWidth);
            }
        }

        // Create distance data texture (single channel floating point texture)
        const distanceTexture = new THREE.DataTexture(
            distanceData,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        distanceTexture.flipY = false;
        distanceTexture.minFilter = THREE.NearestFilter;
        distanceTexture.magFilter = THREE.NearestFilter;
        distanceTexture.generateMipmaps = false;
        distanceTexture.needsUpdate = true;

        return {
            renderTarget: maskRenderTarget,
            distanceTexture
        };
    }

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
    static renderMaskPolygon(
        polygonCoords: GeoCoordinates[],
        geoBox: GeoBox,
        width: number,
        height: number,
        renderEnv: RenderEnvironment
    ): { renderTarget: THREE.WebGLRenderTarget } {
        // Clear the scene
        renderEnv.clearScene();

        // Convert geographic coordinates to pixel coordinates
        const pixelCoords = polygonCoords.map(coord =>
            CoordinateUtils.geoToTileSpace(coord, geoBox, width, height)
        );

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(pixelCoords.length * 3);
        pixelCoords.forEach((coord, i) => {
            positions[i * 3] = coord.x;
            positions[i * 3 + 1] = coord.y;
            positions[i * 3 + 2] = 0;
        });
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

        // Set indices
        if (pixelCoords.length > 2) {
            const indices = earcut(pixelCoords.flatMap(coord => [coord.x, coord.y])); 
            geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
        }

        // Create a custom shader material that only writes to a single channel
        const material = new THREE.ShaderMaterial({
            vertexShader: `
                void main() {
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: singleChannelFragmentShader,
            side: THREE.DoubleSide
        });

        // Create mesh and add to scene
        const mesh = new THREE.Mesh(geometry, material);
        renderEnv.getScene().add(mesh);

        // Create single channel render target
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RedFormat, // Only use the red channel
            type: THREE.UnsignedByteType
        });

        // Execute rendering to single channel texture
        renderEnv.getRenderer().setRenderTarget(renderTarget);
        renderEnv.getRenderer().clear();
        renderEnv.getRenderer().render(renderEnv.getScene(), renderEnv.getCamera());

        // Clean up temporary mesh in the scene
        renderEnv.getScene().remove(mesh);
        geometry.dispose();
        material.dispose();

        return { renderTarget };
    }

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
    static calculateDistanceToPolygonEdge(point: GeoCoordinates, polygon: GeoCoordinates[]): number {
        if (polygon.length < 2) {
            return 0;
        }

        let minDistance = Number.MAX_VALUE;

        // 遍历每条边
        for (let i = 0; i < polygon.length; i++) {
            const startPoint = polygon[i];
            const endPoint = polygon[(i + 1) % polygon.length];

            // 创建线段
            const line = turf.lineString([
                [startPoint.longitude, startPoint.latitude],
                [endPoint.longitude, endPoint.latitude]
            ]);

            // 创建点
            const turfPoint = turf.point([point.longitude, point.latitude]);

            // 计算点到线段的最短距离
            const distance = turf.pointToLineDistance(turfPoint, line, { units: 'meters' });

            if (distance < minDistance) {
                minDistance = distance;
            }
        }

        return minDistance === Number.MAX_VALUE ? 0 : minDistance;
    }

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
    static renderMaskPolygonWithDistanceGPU2(
        polygonCoords: GeoCoordinates[],
        geoBox: GeoBoxType,
        width: number,
        height: number,
        renderEnv: RenderEnvironment,
        modification: any
    ): DistanceTextureResult {
        // Step 1: Render mask (exactly the same as before)
        const { renderTarget: maskRenderTarget } = this.renderMaskPolygon(
            polygonCoords,
            geoBox,
            width,
            height,
            renderEnv
        );

        // Step 2: Calculate distance using GPU (new method)
        // Create contour data texture
        const contourTexture = this.createContourTexture(polygonCoords, width, height);

        // Create shader material
        const distanceMaterial = new THREE.ShaderMaterial({
            uniforms: {
                maskTexture: { value: maskRenderTarget?.texture },
                contourTexture: { value: contourTexture.texture },
                resolution: { value: new THREE.Vector2(width, height) },
                contourLength: { value: polygonCoords.length },
                contourTexSize: { value: new THREE.Vector2(contourTexture.width, contourTexture.height) }
            },
            vertexShader: `
                void main() {
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D maskTexture;
                uniform sampler2D contourTexture;
                uniform vec2 resolution;
                uniform float contourLength;
                uniform vec2 contourTexSize;
                
                // Get vertex coordinates from contour texture
                vec2 getContourPoint(float index) {
                    float x = mod(index, contourTexSize.x);
                    float y = floor(index / contourTexSize.x);
                    vec4 data = texture2D(contourTexture, vec2(x, y) / contourTexSize);
                    return vec2(data.r, data.g); // Decode coordinates
                }
                
                // Calculate distance to line segment
                float distanceToLineSegment(vec2 point, vec2 start, vec2 end) {
                    vec2 line = end - start;
                    float lineLength = length(line);
                    
                    if (lineLength == 0.0) {
                        return distance(point, start);
                    }
                    
                    float t = clamp(dot(point - start, line) / dot(line, line), 0.0, 1.0);
                    vec2 nearest = start + t * line;
                    return distance(point, nearest);
                }
                
                // Calculate minimum distance to polygon
                float distanceToPolygon(vec2 point) {
                    float minDistance = 1e10;
                    
                    // Iterate through all edges
                    for (float i = 0.0; i < 1000.0; i++) {
                        if (i >= contourLength - 1.0) break;
                        
                        vec2 start = getContourPoint(i);
                        vec2 end = getContourPoint(i + 1.0);
                        float dist = distanceToLineSegment(point, start, end);
                        minDistance = min(minDistance, dist);
                    }
                    
                    // Close the polygon (connect the first and last points)
                    if (contourLength > 2.0) {
                        vec2 start = getContourPoint(contourLength - 1.0);
                        vec2 end = getContourPoint(0.0);
                        float dist = distanceToLineSegment(point, start, end);
                        minDistance = min(minDistance, dist);
                    }
                    
                    return minDistance;
                }
                
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    
                    // Sample mask texture
                    float mask = texture2D(maskTexture, uv).r;
                    
                    // Key logic: Only calculate distance for pixels inside the mask
                    if (mask == 0.0) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Distance is 0 for external pixels
                    } else {
                        // Internal pixels: Calculate distance to polygon boundary
                        vec2 pixelCoord = gl_FragCoord.xy;
                        float dist = distanceToPolygon(pixelCoord);
                        gl_FragColor = vec4(dist, 0.0, 0.0, 1.0);
                    }
                }
            `
        });

        // Create full-screen quad geometry
        const distanceGeometry = new THREE.PlaneGeometry(2, 2);

        // Create mesh and add to scene
        const distanceMesh = new THREE.Mesh(distanceGeometry, distanceMaterial);
        renderEnv.clearScene();
        renderEnv.getScene().add(distanceMesh);

        // 🔥 Fix 1: Use RGBAFormat instead of RedFormat, UnsignedByteType instead of FloatType
        const distanceRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType
        });

        // Execute rendering
        renderEnv.getRenderer().setRenderTarget(distanceRenderTarget);
        renderEnv.getRenderer().clear();
        renderEnv.getRenderer().render(renderEnv.getScene(), renderEnv.getCamera());

        // Clean up resources
        renderEnv.getScene().remove(distanceMesh);
        distanceGeometry.dispose();
        distanceMaterial.dispose();
        contourTexture.texture.dispose();

        return {
            renderTarget: maskRenderTarget, // Keep the original mask
            distanceTexture: distanceRenderTarget.texture // GPU calculated distance
        };
    }

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
    static createContourTexture(
        polygonCoords: GeoCoordinates[],
        width: number,
        height: number
    ): { texture: THREE.Texture; width: number; height: number } {
        // Convert geographic coordinates to pixel coordinates
        const pixelCoords = polygonCoords.map(coord =>
            CoordinateUtils.geoToTileSpace(coord, new GeoBoxType(
                new GeoCoordinates(-90, -180),
                new GeoCoordinates(90, 180)
            ), width, height)
        );

        // Calculate texture width (1 pixel per vertex)
        const textureWidth = Math.max(1, pixelCoords.length);
        const textureData = new Float32Array(textureWidth * 4); // RGBA format

        // Encode coordinates into RGBA (supports 0-65535 range)
        for (let i = 0; i < pixelCoords.length; i++) {
            const point = pixelCoords[i];
            const baseIndex = i * 4;
            textureData[baseIndex + 0] = point.x; // R - x high 8 bits
            textureData[baseIndex + 1] = point.y; // G - y low 8 bits
            textureData[baseIndex + 2] = 0;       // B - reserved
            textureData[baseIndex + 3] = 0;       // A - reserved
        }

        // Create data texture
        const texture = new THREE.DataTexture(
            textureData,
            textureWidth,
            1, // Height is 1, 1D texture
            THREE.RGBAFormat,
            THREE.FloatType
        );
        texture.needsUpdate = true;

        return { texture, width: textureWidth, height: 1 };
    }
}
