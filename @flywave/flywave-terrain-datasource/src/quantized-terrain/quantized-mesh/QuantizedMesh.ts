// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import "./Shader";

import {
    type TilingScheme,
    GeoBox,
    geographicTerrainStandardTiling,
    ProjectionType
} from "@flywave/flywave-geoutils";
import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { type GroundOverlayTextureResource } from "../../ground-overlay-provider";
import { type WebTile } from "../../WebImageryTileProvider";
import { type QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
import { ProjectionSwitchController } from "../../ProjectionSwitchController";
import { QuantizedMeshMaterial } from "./QuantizedMeshMaterial";

interface CommonUniforms {
    clipUvTransform: { value: THREE.Vector3 };
    imageryPatchTransform: { value: THREE.Vector4[] };
    imageryPatchArray: { value: THREE.Texture[] };
    imageryPatchCount: { value: number };
    waterMaskTranslationAndScale: { value: THREE.Vector4 };
    waterMaskNoisyTranslationAndScale: { value: THREE.Vector4 };
    waterMaskTexture: { value: THREE.Texture };
    normalSampler: { value: THREE.Texture };
    overlayerImageryTransform: { value: THREE.Vector4 };
    overlayerImagery: { value: THREE.Texture };
    frameNumber: { value: number };
}

export class QuantizedMesh extends THREE.Mesh {
    /**
     * Creates a new QuantizedMesh instance
     *
     * @param tileKey - The tile key identifying this mesh
     * @param tileScheme - The tiling scheme used for coordinate calculations
     */
    constructor(
        private readonly selfGeoBox: GeoBox,
        private readonly quantizedTerrainMesh: QuantizedTerrainMesh,
        protected readonly projectionSwitchController: ProjectionSwitchController,
        protected readonly mapView?: MapView
    ) {
        super(
            undefined,
            new QuantizedMeshMaterial({
                wireframe: false,
                transparent: false,
                blending: THREE.NoBlending
            })
        );
        this.receiveShadow = true;

        this.setupFromQuantizedTerrainMesh(quantizedTerrainMesh);

        this.onBeforeRender = () => {
            const mat = this.material as QuantizedMeshMaterial;
            if (this.mapView) {
                mat.frameNumber = this.mapView.frameNumber ?? 0;
            }
            mat.syncStaticUniforms();
        };
    }

    /**
     * Sets up the mesh from quantized terrain mesh data
     *
     * This method configures the mesh geometry, transforms, and associated
     * textures from quantized terrain data including:
     * - Geometry and spatial transforms
     * - Parent tile key for clip UV calculations
     * - Water mask data for ocean rendering
     *
     * @param quantizedData - The quantized terrain mesh data
     */
    private setupFromQuantizedTerrainMesh(quantizedData: QuantizedTerrainMesh): void {
        // Apply geometry and spatial transforms
        this.geometry = quantizedData.quantizedGeometry;
        this.position.copy(quantizedData.position);
        this.scale.copy(quantizedData.scale);
        this.quaternion.copy(quantizedData.quaternion);

        // Setup texture coordinate transformations
        this.setupParentTileKey(quantizedData.geoBox);
        this.setupWaterMask(quantizedData);
    }

    /**
     * Sets up the imagery texture for this mesh with proper UV coordinate transformation
     *
     * @param imageryResource - The imagery resource containing tile key and texture
     */
    public setupImageryTexture(
        webTiles: WebTile[],
        webTingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): void {
        const material = this.material as QuantizedMeshMaterial;

        const webTilesUnifrom: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }> = [];
        webTiles.map(tile => {
            const transform = this.computeTextureUvTransform(
                tile.geoBox,
                webTingScheme,
                quantizedTilingScheme
            );
            if (transform !== false) {
                webTilesUnifrom.push({
                    texture: tile.texture,
                    transform
                });
            }
        });
        // Calculate and set UV transform for proper texture alignment
        material.imageryPatchs = webTilesUnifrom;
    }

    public setupOverlayerTexture(
        groundOverlay: GroundOverlayTextureResource | null,
        webTingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): void {
        const material = this.material as QuantizedMeshMaterial;
        if (groundOverlay) {
            const transform = this.computeTextureUvTransform(
                groundOverlay.geoBox,
                webTingScheme,
                quantizedTilingScheme
            );
            if (transform) {
                material.setupOverlayerTexture({
                    transform,
                    texture: groundOverlay.texture
                });
                return;
            }
        }
        material.setupOverlayerTexture(null);
    }

    /**
     * Sets up the water mask for ocean/sea area rendering with animated wave effects
     *
     * @param waterResource - The water mask resource containing tile key and terrain data
     */
    private setupWaterMask(waterResource: QuantizedTerrainMesh): void {
        // Skip if no water mask data is available
        if (!waterResource.waterMask) return;

        const material = this.material as QuantizedMeshMaterial;

        // Set water mask texture for ocean detection
        material.waterMaskTexture = waterResource.waterMaskTexture;

        // Calculate and set water mask transforms for proper positioning
        const waterGeoBox = GeoBox.fromArray(waterResource.waterMask.geoBox);
        material.waterMaskTranslationAndScale = this._computeWaterMaskTransform(waterGeoBox);

        // Calculate and set noisy water effect transforms
        material.waterMaskNoisyTranslationAndScale = this._computeWaterMaskNoisyTransform(
            this.selfGeoBox
        );
    }

    /**
     * Sets up the parent tile key for clip UV calculations
     * Used to determine texture coordinate clamping boundaries
     *
     * @param parentTileKey - The parent tile key for reference
     */
    private setupParentTileKey(parentGeobox: GeoBox): void {
        const material = this.material as QuantizedMeshMaterial;
        material.clipUvTransform = this._computeClipUvTransform(parentGeobox);
    }

    /**
     * Computes the texture UV transform between imagery and quantized tiles
     * Ensures proper alignment and scaling of imagery textures
     *
     * @param imageryTileKey - The imagery tile key for source coordinates
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed UV transform as a Vector4 (scaleX, scaleY, offsetX, offsetY)
     */
    private computeTextureUvTransform(
        imageryGeoBox: GeoBox,
        imageryTilingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): THREE.Vector4 | false {
        // 1. 计算投影后的坐标范围
        const quantizedWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.southWest,
                new THREE.Vector3()
            ),
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.northEast,
                new THREE.Vector3()
            )
        );
        const imageryWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.southWest,
                new THREE.Vector3()
            ),
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.northEast,
                new THREE.Vector3()
            )
        );

        // 2. 计算缩放比例（保留符号）
        const textureSize = new THREE.Vector2().subVectors(
            imageryWorldBox.max,
            imageryWorldBox.min
        );
        const tileSize = new THREE.Vector2().subVectors(
            quantizedWorldBox.max,
            quantizedWorldBox.min
        );

        const scaleX = tileSize.x / textureSize.x;
        const scaleY = tileSize.y / textureSize.y;

        // 3. 计算偏移量（注意Y轴方向）
        let offsetX;
        let offsetY;
        if (quantizedTilingScheme == geographicTerrainStandardTiling) {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (imageryWorldBox.max.y - quantizedWorldBox.max.y) / textureSize.y; // 反转Y轴
        } else {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (quantizedWorldBox.min.y - imageryWorldBox.min.y) / textureSize.y; // 反转Y轴
        }

        const transform = new THREE.Vector4(scaleX, scaleY, offsetX, offsetY);

        // 4. 验证变换是否有效
        if (Number.isFinite(transform.length()) && Math.abs(scaleX) > 0 && Math.abs(scaleY) > 0) {
            return transform;
        }
        return false;
    }

    /**
     * Computes the clip UV transform between parent and current tiles
     * Used for texture coordinate clamping to prevent bleeding
     *
     * @param parentTileKey - The parent tile key for reference
     * @param currentTileKey - The current tile key for target coordinates
     * @returns The computed clip UV transform as a Vector3 (scale, offsetX, offsetY)
     */
    private _computeClipUvTransform(parentGeobox: GeoBox): THREE.Vector3 {
        const currentGeobox = this.selfGeoBox;
        // 计算当前瓦片在父瓦片坐标系中的UV范围
        const parentWidth = parentGeobox.longitudeSpan;
        const parentHeight = parentGeobox.latitudeSpan;

        // 计算当前瓦片相对于父瓦片的偏移和缩放
        const uScale = currentGeobox.longitudeSpan / parentWidth;
        const vScale = currentGeobox.latitudeSpan / parentHeight;

        // 计算UV偏移（从父瓦片的西北角到当前瓦片的西北角）
        const uOffset = (currentGeobox.west - parentGeobox.west) / parentWidth;
        const vOffset = (currentGeobox.south - parentGeobox.south) / parentHeight;

        // 合并缩放因子（假设在片段着色器中使用）
        const scale = uScale * vScale;

        return new THREE.Vector3(scale, uOffset, vOffset);
    }

    /**
     * Computes the water mask transform between water and quantized tiles
     * Ensures proper positioning and scaling of water mask textures
     *
     * @param waterGeoBox - The geographic bounding box of the water mask
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed water mask transform as a Vector4 (offsetX, offsetY, scaleX, scaleY)
     */
    private _computeWaterMaskTransform(waterGeoBox: GeoBox): THREE.Vector4 {
        const quantizedGeoBox = this.quantizedTerrainMesh.geoBox;

        const tileWidth = quantizedGeoBox.longitudeSpan;
        const tileHeight = quantizedGeoBox.latitudeSpan;

        const scaleX = tileWidth / waterGeoBox.longitudeSpan;
        const scaleY = tileHeight / waterGeoBox.latitudeSpan;

        return new THREE.Vector4(
            (scaleX * (quantizedGeoBox.west - waterGeoBox.west)) / tileWidth,
            (scaleY * (quantizedGeoBox.south - waterGeoBox.south)) / tileHeight,
            scaleX,
            scaleY
        );
    }

    /**
     * Computes the noisy water mask transform for animated wave effects
     * Provides proper positioning and scaling for water surface animations
     *
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed noisy water mask transform as a Vector4 (offsetX, offsetY, scaleX, scaleY)
     */
    private _computeWaterMaskNoisyTransform(quantizedGeoBox: GeoBox): THREE.Vector4 {
        const tileWidth = quantizedGeoBox.longitudeSpan;
        const tileHeight = quantizedGeoBox.latitudeSpan;

        const scaleX = tileWidth / 180; // Global scaling factor
        const scaleY = tileHeight / 90; // Global scaling factor

        return new THREE.Vector4(
            (scaleX * (quantizedGeoBox.west - 0)) / tileWidth,
            (scaleY * (quantizedGeoBox.south - 0)) / tileHeight,
            scaleX,
            scaleY
        );
    }
}
