/* Copyright (C) 2025 flywave.gl contributors */

import "../quantized-mesh/Shader";

import {
    type GeoBox,
    ProjectionType,
    type TilingScheme,
    geographicTerrainStandardTiling
} from "@flywave/flywave-geoutils";
import { VisualStyle } from "@flywave/flywave-materials";
import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { type GroundOverlayTextureResource } from "../../ground-overlay-provider";
import { type WebTile } from "../../WebImageryTileProvider";
import { StratumMaterial } from "./stratum-tile/StratumMaterial";
import { type StratumTileData } from "./stratum-tile/StratumTileData";

/**
 * Mesh class for rendering quantized terrain data with specialized texture handling
 *
 * This mesh class provides comprehensive support for:
 * - Quantized terrain geometry rendering
 * - Multi-layer texture mapping (imagery, water masks)
 * - UV coordinate transformations for proper texture alignment
 * - Water rendering with animated wave effects
 * - Clip UV functionality for texture clamping
 *
 * The mesh handles both terrain geometry and associated textures, providing a
 * complete solution for 3D terrain visualization.
 */
export class QuantizedStratumMesh extends THREE.Mesh {
    /**
     * Creates a new QuantizedMesh instance
     *
     * @param tileKey - The tile key identifying this mesh
     * @param tileScheme - The tiling scheme used for coordinate calculations
     */
    constructor(
        private readonly quantizedTerrainMesh: StratumTileData,
        private readonly mapView: MapView
    ) {
        const stratumMaterial = new StratumMaterial({ wireframe: false });
        super(quantizedTerrainMesh.geometry, stratumMaterial);
        quantizedTerrainMesh.geometry.computeVertexNormals();

        // let geo = new StratumVoxel(
        //     quantizedTerrainMesh.layers[50].voxels.find(voxel => voxel.id === "L2-171"),
        //     quantizedTerrainMesh
        // );
        // let sphere = new THREE.Mesh(
        //     new THREE.SphereGeometry(geo.boundingSphere.radius),
        //     new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0, 0), wireframe: true })
        // );
        // sphere.position.copy(geo.boundingSphere.center);
        // this.add(sphere);

        this.receiveShadow = true;

        //build style
        stratumMaterial.setBatchValues(this.setupStratumStylesValues());
        stratumMaterial.setBatchStyles(this.setupStratumStyles());
    }

    private setupStratumStylesValues() {
        const materials = this.quantizedTerrainMesh.materials;

        const values = new Map<number, number>();
        materials.forEach((material, index) => {
            values.set(index, 1);
        });
        return values;
    }

    private setupStratumStyles(): Map<number, VisualStyle> {
        const materials = this.quantizedTerrainMesh.materials;
        const styles = new Map<number, VisualStyle>();
        materials.forEach((material, index) => {
            const { r, g, b, a } = material.color;
            styles.set(
                index,
                new VisualStyle(
                    new THREE.Color(r / 255, g / 255, b / 255),
                    new THREE.Color(r / 255, g / 255, b / 255)
                )
            );
        });
        return styles;
    }
 

    public setUpClipGeoBox(geoBox: GeoBox, quantizedTilingScheme: TilingScheme) {
        const material = this.material as StratumMaterial;
        const transform = this.computeTextureUvTransform(
            geoBox,
            quantizedTilingScheme,
            quantizedTilingScheme
        );
        if (transform) material.clipPatch = transform;
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
        const material = this.material as StratumMaterial;

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
        const material = this.material as StratumMaterial;
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
}
