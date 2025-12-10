/* Copyright (C) 2025 flywave.gl contributors */

// height-map/HeightMapTerrainMesh.ts
import {
    type TileGeometryBuilder,
    type TileTransformation
} from "@flywave/flywave-geometry";
import { type GeoBox, type TilingScheme, ProjectionType, TileKey } from "@flywave/flywave-geoutils";
import { MapView, Tile } from "@flywave/flywave-mapview";
import { DataTexture, Matrix4, Mesh, Vector3, Vector4 } from "three";
import * as THREE from "three";

import { type GroundOverlayTextureResource } from "../ground-overlay-provider";
import { type WebTile } from "../WebImageryTileProvider";
import { DEMTileMeshMaterial } from "./DEMTileMeshMaterial";
import { ProjectionSwitchController } from "../ProjectionSwitchController";

/**
 * Unpacking parameters for height map elevation values
 * These values are used to decode elevation data from texture color values
 */
const uDemUnpack0 = new Vector4(6553.6, 25.6, 0.1, 10000.0);
/**
 * Alternative unpacking parameters for height map elevation values
 */
const uDemUnpack1 = new Vector4(0.0, 0.0, 0, 0);
/**
 * Empty texture used as a placeholder when no height map is available
 */
const emptyTexture = new DataTexture();

/**
 * Computes the position and scaling parameters for a height map texture
 *
 * This function calculates how a height map texture from a specific DEM tile
 * should be sampled and scaled to provide elevation data for the current tile.
 *
 * @param tileKey - The tile key for the current tile
 * @param demTileKey - The tile key for the DEM tile containing the height data
 * @param yDown - Whether the Y axis is down (true) or up (false)
 * @returns A Vector3 containing the scaling and offset parameters
 */
function computeHeightMapPos(tileKey: TileKey, demTileKey: TileKey, yDown: boolean): Vector3 {
    tileKey = TileKey.fromRowColumnLevel(
        !yDown ? tileKey.row : (1 << tileKey.level) - 1 - tileKey.row,
        tileKey.column,
        tileKey.level
    );
    let ah = 1;
    let H = tileKey.level;
    let ae = tileKey.row;
    let J = tileKey.column;

    for (; H > demTileKey.level; H--) {
        ah *= 2;
        ae >>= 1;
        J >>= 1;
    }
    const P = 1 / ah;

    return new Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P);
}

/**
 * Mesh representing a terrain tile with height map based elevation
 *
 * This class extends Three.js Mesh to provide specialized functionality
 * for rendering terrain tiles with elevation data from DEM (Digital Elevation Model)
 * height maps. It handles texture mapping, UV transformations, and elevation-based
 * vertex displacement.
 */
export class HeightMapTerrainMesh extends Mesh {
    /** Patch position matrix for simple terrain patches */
    private m_uPatchPos: Matrix4;
    /** Position parameters for height map sampling */
    private m_uHeightMapPos?: Vector3;
    /** Flag indicating if this is a simple patch */
    private readonly m_isSimplePatch: boolean = false;
    /** The material used for rendering this mesh */
    private readonly m_material: DEMTileMeshMaterial;
    /** The height map texture */
    private m_uHeighMapTexture: THREE.Texture = emptyTexture;
    /** The geographic bounding box of this tile */
    private readonly m_selfGeoBox: GeoBox;

    /** Displacement vector for positioning the mesh */
    public displacement: Vector3 = new Vector3();

    /** The tile transformation data */
    private readonly m_transformation: TileTransformation;

    /** Target Z rotation for spherical projection */
    private readonly m_targetZRotation: number;

        /** The skirt height for the mesh */
    private readonly m_skirtHeight: number;

    private readonly m_yDown: boolean = this.m_tilingSchemeTileGrid.isYAxisDown();

    /**
     * Creates a new height map terrain mesh
     *
     * @param mapView - The MapView instance
     * @param tileKey - The tile key identifying this mesh
     * @param terrainTilingScheme - The tiling scheme for the terrain
     * @param materialParams - Optional material parameters
     * @param tilingSchemeTileGrid - The tile geometry builder
     */
    constructor(
        private readonly m_tile: Tile,
        private readonly m_terrainTilingScheme: TilingScheme,
        private readonly m_projectionSwitchController: ProjectionSwitchController,
        private readonly m_tilingSchemeTileGrid: TileGeometryBuilder,
        materialParams?: THREE.MeshStandardMaterialParameters,
    ) {
        const material = new DEMTileMeshMaterial({...materialParams,transparent:false});
        const geometryWithTransform = m_tilingSchemeTileGrid.getTileGeometryWithTransform(m_tile.tileKey);

        super(geometryWithTransform.geometry, material);
        this.m_selfGeoBox = this.m_terrainTilingScheme.getGeoBox(m_tile.tileKey);
        this.m_material = material;
        this.m_isSimplePatch = geometryWithTransform.geometry.mode.is_simple_patch;
        this.m_transformation = geometryWithTransform.transformation;
        this.m_skirtHeight = geometryWithTransform.skirtHeight;
        
        // 计算目标Z旋转（球面投影时的旋转值）
        this.m_targetZRotation = (Math.PI * 2 * m_tile.tileKey.column) /
            this.m_tilingSchemeTileGrid
                .getTilingScheme()
                .subdivisionScheme.getLevelDimensionX(m_tile.tileKey.level);

        this._initializeMesh();
 
        this.frustumCulled = false;
    }


    /**
     * Initializes the mesh with basic properties
     */
    private _initializeMesh() {
        this.receiveShadow = true;

        // 初始更新一次变换
        this.updateProjectionTransform();
    }

    onBeforeRender(): void {
        this.updateProjectionTransform();
    }

    /**
     * Updates the mesh transformation based on current projection factor
     */
    updateProjectionTransform() {
        const projectionFactor = this.m_projectionSwitchController.projectionFactor;

        // 使用插值获取当前变换
        const interpolatedTransform = this.m_transformation.interpolate(projectionFactor);


        // 应用插值后的旋转矩阵（如果存在）
        if (interpolatedTransform.rotation) {
            this.m_uPatchPos = interpolatedTransform.rotation;
            this.m_material.commonUniform.uPatchPos.value.copy(this.m_uPatchPos);
        } else {
            this.m_uPatchPos = new Matrix4();
            this.m_material.commonUniform.uPatchPos.value.copy(this.m_uPatchPos);
        }
        // 设置裙边高度偏移
        this.m_material.commonUniform.uSkirtHeight.value = this.m_skirtHeight;

        this.quaternion.identity();
        // 特殊处理：Z轴旋转插值
        if (!this.m_isSimplePatch) {
            // 球面投影时的目标旋转值，墨卡托投影时旋转为0
            const targetRotation = this.m_targetZRotation;
            const currentZRotation = targetRotation * (1 - projectionFactor); // 从targetRotation到0的插值
            this.rotateZ(currentZRotation);
        }

        this.displacement.copy(interpolatedTransform.position).sub(this.m_tile.center);

        this.m_material.commonUniform.uProjectionFactor.value = projectionFactor;
    }

    /**
     * Updates the shader uniforms with current mesh parameters
     *
     * This method sets up the uniform values that the shader needs to properly
     * render the terrain, including height map parameters and patch positioning.
     */
    updateUniforms() {

        const mat = new Matrix4();

        mat.elements[3] = this.m_isSimplePatch ? 1 : 0;

        if (this.m_uPatchPos) {
            this.m_material.commonUniform.uPatchPos.value.copy(this.m_uPatchPos);
        }

        if (this.m_uHeightMapPos) {
            mat.elements[4] = uDemUnpack0.x;
            mat.elements[5] = uDemUnpack0.y;
            mat.elements[6] = uDemUnpack0.z;
            mat.elements[7] = uDemUnpack0.w;

            mat.elements[8] = this.m_uHeightMapPos.x;
            mat.elements[9] = this.m_uHeightMapPos.y;
            mat.elements[10] = this.m_uHeightMapPos.z;

            this.m_material.commonUniform.uHeighMapTexture.value = this.m_uHeighMapTexture;
        } else {
            this.m_material.commonUniform.uHeighMapTexture.value = emptyTexture;
            mat.elements[4] = uDemUnpack1.x;
            mat.elements[5] = uDemUnpack1.y;
            mat.elements[6] = uDemUnpack1.z;
            mat.elements[7] = uDemUnpack1.w;

            mat.elements[8] = 1;
            mat.elements[9] = 0;
            mat.elements[10] = 0;
        }

        this.m_material.commonUniform.pack.value.copy(mat);

        // Update projection uniforms if available
        const controller = this.m_projectionSwitchController;
        if (controller) {
            const material = this.material as DEMTileMeshMaterial;
            material.setProjectionUniforms(
                controller.projectionFactor
            );
        }
    }

    /**
     * Sets the height map texture for this mesh
     *
     * This method configures the mesh to use a specific height map texture
     * for elevation data, calculating the appropriate sampling parameters.
     *
     * @param texture - The height map texture
     * @param demTileKey - The tile key of the DEM tile containing the height data
     */
    setHeightMap(texture: THREE.Texture, demTileKey: TileKey) {
        this.m_uHeightMapPos = computeHeightMapPos(
            this.m_tile.tileKey,
            demTileKey,
            this.m_tilingSchemeTileGrid.isYAxisDown()
        );
        texture.flipY = this.m_yDown;
        this.m_uHeighMapTexture = texture;
        this.m_material.commonUniform.uHeighMapTexture.value = texture;
    }

    /**
     * Sets up imagery textures for this mesh
     *
     * This method configures the mesh to use web tile imagery textures,
     * calculating the appropriate UV transformations for proper alignment.
     *
     * @param webTiles - Array of web tiles with textures and geo boxes
     * @param webTingScheme - The tiling scheme for the web tiles
     */
    public setupImageryTexture(webTiles: WebTile[], webTingScheme: TilingScheme): void {
        const material = this.material as DEMTileMeshMaterial;

        const webTilesUnifrom: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }> = [];
        webTiles.map(tile => {
            const transform = this.computeTextureUvTransform(tile.geoBox, webTingScheme);
            if (transform !== false) {
                tile.texture.flipY = this.m_yDown;
                webTilesUnifrom.push({
                    texture: tile.texture,
                    transform
                });
            }
        });
        // Calculate and set UV transform for proper texture alignment
        material.imageryPatchs = webTilesUnifrom;
    }

    /**
     * Sets up overlay texture for this mesh
     *
     * This method configures an overlay texture that will be rendered on top
     * of the base terrain imagery.
     *
     * @param groundOverlay - The ground overlay texture resource or null
     * @param webTingScheme - The tiling scheme for the overlay
     */
    public setupOverlayerTexture(
        groundOverlay: GroundOverlayTextureResource | null,
        webTingScheme: TilingScheme
    ): void {
        const material = this.material as DEMTileMeshMaterial;
        if (groundOverlay) {
            const transform = this.computeTextureUvTransform(groundOverlay.geoBox, webTingScheme);
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
     * Computes the UV transformation for texture mapping
     *
     * This method calculates the appropriate scaling and offset parameters
     * needed to properly align a texture with the mesh's geographic bounds.
     *
     * @param imageryGeoBox - The geographic bounds of the imagery
     * @param imageryTilingScheme - The tiling scheme for the imagery
     * @returns A Vector4 with scaling and offset parameters, or false if invalid
     */
    private computeTextureUvTransform(
        imageryGeoBox: GeoBox,
        imageryTilingScheme: TilingScheme
    ): THREE.Vector4 | false {
        // 1. 计算投影后的坐标范围
        const quantizedWorldBox = new THREE.Box3();
        quantizedWorldBox.expandByPoint(
            imageryTilingScheme.projection.projectPoint(
                this.m_selfGeoBox.southWest,
                new THREE.Vector3()
            )
        );
        quantizedWorldBox.expandByPoint(
            imageryTilingScheme.projection.projectPoint(
                this.m_selfGeoBox.northEast,
                new THREE.Vector3()
            )
        );

        const imageryWorldBox = new THREE.Box3();
        imageryWorldBox.expandByPoint(
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.southWest,
                new THREE.Vector3()
            )
        );
        imageryWorldBox.expandByPoint(
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

        const scaleX = Math.abs(tileSize.x / textureSize.x);
        const scaleY = Math.abs(tileSize.y / textureSize.y);

        // 3. 计算偏移量（注意Y轴方向）
        let offsetX;
        let offsetY;
        if (this.m_tilingSchemeTileGrid.isYAxisDown()) {
            offsetX = Math.abs(quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = Math.abs(quantizedWorldBox.max.y - imageryWorldBox.max.y) / textureSize.y; // 反转Y轴
        } else {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (quantizedWorldBox.min.y - imageryWorldBox.min.y) / textureSize.y; // 反转Y轴
        }

        const transform = new THREE.Vector4(scaleX, scaleY, offsetX, offsetY);

        // 4. 验证变换是否有效
        if (Number.isFinite(transform.length())) {
            return transform;
        }
        return false;
    }

    /**
     * Sets the depth packing value for depth buffer encoding
     *
     * @param value - The depth packing value to set
     */
    setDepthPacking(value: number) {
        this.m_material.commonUniform.depth_packing_value.value = value;
    }

    /**
     * Disposes of the mesh and its resources
     *
     * This method cleans up the geometry and material resources to prevent
     * memory leaks when the mesh is no longer needed.
     */
    dispose() {
        this.geometry.dispose();
        this.m_material.dispose();
    }

    /**
     * Clones the mesh
     *
     * @param recursive - Whether to recursively clone child objects
     * @returns A new instance of the mesh
     */
    clone(recursive?: boolean): this {
        return this
    }
}