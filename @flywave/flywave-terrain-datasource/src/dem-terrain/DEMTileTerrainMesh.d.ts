import { type TileGeometryBuilder } from "@flywave/flywave-geometry";
import { type TilingScheme, TileKey } from "@flywave/flywave-geoutils";
import { Tile } from "@flywave/flywave-mapview";
import { Mesh, Vector3 } from "three";
import * as THREE from "three";
import { type GroundOverlayTextureResource } from "../ground-overlay-provider";
import { type WebTile } from "../WebImageryTileProvider";
import { ProjectionSwitchController } from "../ProjectionSwitchController";
/**
 * Mesh representing a terrain tile with height map based elevation
 *
 * This class extends Three.js Mesh to provide specialized functionality
 * for rendering terrain tiles with elevation data from DEM (Digital Elevation Model)
 * height maps. It handles texture mapping, UV transformations, and elevation-based
 * vertex displacement.
 */
export declare class HeightMapTerrainMesh extends Mesh {
    private readonly m_tile;
    private readonly m_terrainTilingScheme;
    private readonly m_projectionSwitchController;
    private readonly m_tilingSchemeTileGrid;
    /** Patch position matrix for simple terrain patches */
    private m_uPatchPos;
    /** Position parameters for height map sampling */
    private m_uHeightMapPos?;
    /** Flag indicating if this is a simple patch */
    private readonly m_isSimplePatch;
    /** The material used for rendering this mesh */
    private readonly m_material;
    /** The height map texture */
    private m_uHeighMapTexture;
    /** The geographic bounding box of this tile */
    private readonly m_selfGeoBox;
    /** Displacement vector for positioning the mesh */
    displacement: Vector3;
    /** The tile transformation data */
    private readonly m_transformation;
    /** Target Z rotation for spherical projection */
    private readonly m_targetZRotation;
    /** The skirt height for the mesh */
    private readonly m_skirtHeight;
    private readonly m_yDown;
    /**
     * Creates a new height map terrain mesh
     *
     * @param mapView - The MapView instance
     * @param tileKey - The tile key identifying this mesh
     * @param terrainTilingScheme - The tiling scheme for the terrain
     * @param materialParams - Optional material parameters
     * @param tilingSchemeTileGrid - The tile geometry builder
     */
    constructor(m_tile: Tile, m_terrainTilingScheme: TilingScheme, m_projectionSwitchController: ProjectionSwitchController, m_tilingSchemeTileGrid: TileGeometryBuilder, materialParams?: THREE.MeshStandardMaterialParameters);
    /**
     * Initializes the mesh with basic properties
     */
    private _initializeMesh;
    onBeforeRender(): void;
    /**
     * Updates the mesh transformation based on current projection factor
     */
    updateProjectionTransform(): void;
    /**
     * Updates the shader uniforms with current mesh parameters
     *
     * This method sets up the uniform values that the shader needs to properly
     * render the terrain, including height map parameters and patch positioning.
     */
    updateUniforms(): void;
    /**
     * Sets the height map texture for this mesh
     *
     * This method configures the mesh to use a specific height map texture
     * for elevation data, calculating the appropriate sampling parameters.
     *
     * @param texture - The height map texture
     * @param demTileKey - The tile key of the DEM tile containing the height data
     */
    setHeightMap(texture: THREE.Texture, demTileKey: TileKey): void;
    /**
     * Sets up imagery textures for this mesh
     *
     * This method configures the mesh to use web tile imagery textures,
     * calculating the appropriate UV transformations for proper alignment.
     *
     * @param webTiles - Array of web tiles with textures and geo boxes
     * @param webTingScheme - The tiling scheme for the web tiles
     */
    setupImageryTexture(webTiles: WebTile[], webTingScheme: TilingScheme): void;
    /**
     * Sets up overlay texture for this mesh
     *
     * This method configures an overlay texture that will be rendered on top
     * of the base terrain imagery.
     *
     * @param groundOverlay - The ground overlay texture resource or null
     * @param webTingScheme - The tiling scheme for the overlay
     */
    setupOverlayerTexture(groundOverlay: GroundOverlayTextureResource | null, webTingScheme: TilingScheme): void;
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
    private computeTextureUvTransform;
    /**
     * Sets the depth packing value for depth buffer encoding
     *
     * @param value - The depth packing value to set
     */
    setDepthPacking(value: number): void;
    /**
     * Disposes of the mesh and its resources
     *
     * This method cleans up the geometry and material resources to prevent
     * memory leaks when the mesh is no longer needed.
     */
    dispose(): void;
    /**
     * Clones the mesh
     *
     * @param recursive - Whether to recursively clone child objects
     * @returns A new instance of the mesh
     */
    clone(recursive?: boolean): this;
}
