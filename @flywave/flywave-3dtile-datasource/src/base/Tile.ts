/* Copyright (C) 2025 flywave.gl contributors */

import { GL } from "@flywave/flywave-utils";
import {
    type BufferGeometry,
    type Material,
    type Matrix4,
    type Object3D,
    type Scene,
    type Texture
} from "three";

import Tile3DBatchTable from "../loader/classes/Tile3DBatchTable";
import Tile3DFeatureTable from "../loader/classes/Tile3DFeatureTable";
import {
    type ImplicitTilingData,
    type TILE_REFINEMENT,
    type Tiles3DTileContent,
    type Tiles3DTileContentJSON,
    type Tiles3DTileJSONPostprocessed,
    type Tiles3DTilesetJSONPostprocessed
} from "../loader/types";
import { type TileIntersection } from "../renderer/raycastTraverse";
import { SphereHelper } from "../renderer/SphereHelper";
import { type TileBoundingVolume } from "../utilities/TileBoundingVolume";
import { OrientedBoxHelper } from "@flywave/flywave-geoutils";

/**
 * Bounding volume representation for a 3D Tile
 *
 * A bounding volume defines the volume that completely encloses a tile's content.
 * It can be represented as an axis-aligned bounding box, a bounding sphere, or
 * a geographic region.
 */
export interface BoundingVolume {
    /**
     * Axis-aligned bounding box (12-element array)
     *
     * Format: [centerX, centerY, centerZ, xAxisX, xAxisY, xAxisZ, yAxisX, yAxisY, yAxisZ, zAxisX, zAxisY, zAxisZ]
     * where the center is the box center and the axes define the box orientation and half-lengths.
     */
    box?: [
        centerX: number,
        centerY: number,
        centerZ: number,
        xAxisX: number,
        xAxisY: number,
        xAxisZ: number, // X-axis direction
        yAxisX: number,
        yAxisY: number,
        yAxisZ: number, // Y-axis direction
        zAxisX: number,
        zAxisY: number,
        zAxisZ: number // Z-axis direction
    ];

    /**
     * Bounding sphere (4-element array)
     *
     * Format: [centerX, centerY, centerZ, radius]
     */
    sphere?: [number, number, number, number];

    /**
     * Geographic region bounding volume (6-element array)
     *
     * Format: [minLon, minLat, maxLon, maxLat, minHeight, maxHeight]
     * where longitude and latitude are in radians and heights are in meters.
     */
    region?: [
        minLon: number, // Western longitude (radians)
        minLat: number, // Southern latitude (radians)
        maxLon: number, // Eastern longitude (radians)
        maxLat: number, // Northern latitude (radians)
        minHeight: number, // Minimum height (meters)
        maxHeight: number // Maximum height (meters)
    ];
}

/**
 * Cached data for a tile
 *
 * This interface defines the structure of cached tile data that is used
 * to avoid reprocessing tile content when possible.
 */
export interface TileCache {
    /**
     * Transform matrix for the tile
     */
    transform: Matrix4;

    /**
     * Inverse of the transform matrix
     */
    transformInverse: Matrix4;

    /**
     * Whether the tile is currently active
     */
    active: boolean;

    /**
     * Bounding volume of the tile
     */
    boundingVolume: TileBoundingVolume;

    /**
     * Scene or Object3D containing the tile's content
     */
    scene: Scene | Object3D;

    /**
     * Debug bounding volume visualization
     */
    debugBoundingVolume: Object3D;

    /**
     * Array of BufferGeometry objects for the tile
     */
    geometry?: BufferGeometry[];

    /**
     * Array of Material objects for the tile
     */
    materials?: Material[];

    /**
     * Array of Texture objects for the tile
     */
    textures?: Texture[];

    /**
     * Number of bytes used by the tile's content
     */
    bytesUsed: number;
}

/**
 * Abstract base class for 3D Tiles
 *
 * This class defines the common interface and properties for all 3D Tile types.
 * It includes properties for tile hierarchy management, visibility tracking,
 * and bounding volume visualization.
 */
export abstract class ITile {
    /**
     * Hierarchy depth from the TileGroup
     */
    __depth: number;

    /**
     * The screen space error for this tile
     */
    __error: number;

    /**
     * Distance from this tile's bounds to the nearest active camera
     *
     * This value is expected to be filled in during calculateError implementations.
     */
    __distanceFromCamera: number;

    /**
     * Whether this tile is currently active
     *
     * A tile is active if its content is loaded and ready to be made visible if needed.
     */
    __active: boolean;

    /**
     * Whether this tile is currently visible
     *
     * A tile is visible if:
     * 1. Its content is loaded
     * 2. It is within a camera frustum
     * 3. It meets the SSE requirements
     */
    __visible: boolean;

    /**
     * Whether the tile was visited during the last update run
     */
    __used: boolean;

    /**
     * Whether the tile was within the frustum on the last update run
     */
    __inFrustum: boolean;

    __basePath: string;

    /**
     * The depth of the tiles that increments only when a child with geometry content is encountered
     */
    __depthFromRenderedParent: number;

    /**
     * Frame number when the tile was last visited
     */
    __lastFrameVisited: number;

    /**
     * Child tile references
     */
    abstract get children(): ITile[];

    /**
     * Parent tile reference
     */
    parent?: ITile;

    /**
     * Extensions used by this tile
     */
    extensions?: Record<string, any>;

    /**
     * Content metadata for this tile
     */
    abstract get content(): Tiles3DTileContentJSON;

    /**
     * Cached data for the tile
     */
    cached: TileCache;

    // Properties from metadata
    /**
     * Implicit tiling data for this tile
     */
    abstract get implicitTiling(): ImplicitTilingData;

    /**
     * Transform matrix for this tile
     */
    abstract get transform(): number[];

    /**
     * Bounding volume for this tile
     */
    abstract get boundingVolume(): BoundingVolume;

    /**
     * Geometric error for this tile
     */
    abstract get geometricError(): number;

    /**
     * Refinement type for this tile
     */
    abstract get refine(): TILE_REFINEMENT;

    /**
     * Sets the refinement type for this tile
     */
    abstract set refine(value: TILE_REFINEMENT);

    private __debugSphere: SphereHelper;
    private __debugBox: OrientedBoxHelper;

    /**
     * Debug bounding volume visualization
     *
     * @param type - Type of bounding volume to visualize ("sphere", "box", or false to hide)
     */
    debugBoundingVolume(type?: "sphere" | "box" | false,rootObject?:Object3D) {
        switch (type) {
            case "sphere": {
                if (!this.__debugSphere) {
                    this.__debugSphere = new SphereHelper(this.cached.boundingVolume.sphere); 
                }
                rootObject?.add(this.__debugSphere);
                break;
            }
            case "box": {
                if (!this.__debugBox) {
                    this.__debugBox = new OrientedBoxHelper(this.cached.boundingVolume.regionObb); 
                }
               rootObject?.add(this.__debugBox);
                break;
            }
            case false: {
                rootObject?.remove(this.__debugSphere);
                rootObject?.remove(this.__debugBox);
                break;
            }
        }
    }
}

/**
 * Abstract base class for internal tile implementations
 *
 * This class extends ITile with additional properties for internal tile management,
 * including resource tracking, visibility tracking, and download state tracking.
 */
export abstract class TileInternal extends ITile {
    // tile description
    __isLeaf: boolean;
    __hasContent: boolean;
    __hasRenderableContent: boolean;
    __hasUnrenderableContent: boolean;

    // resource tracking
    __usedLastFrame: boolean;
    declare __used: boolean;

    // Visibility tracking
    __allChildrenLoaded: boolean;
    __childrenWereVisible: boolean;
    declare __inFrustum: boolean;
    __wasSetVisible: boolean;

    // download state tracking
    /**
     * This tile is currently active if:
     *  1: Tile content is loaded and ready to be made visible if needed
     */
    declare __active: boolean;
    __loadIndex: number;
    __loadAbort: AbortController | null;
    __loadingState: number;
    __wasSetActive: boolean;

    __childrenProcessed: number;
}

/**
 * Concrete implementation of a 3D Tile
 *
 * This class represents a concrete 3D Tile with actual content. It includes
 * functionality for managing batch tables, feature tables, and various
 * property accessors for tile data.
 */
export class Tile extends TileInternal {
    /**
     * Hierarchy Depth from the TileGroup
     */
    declare __depth: number;

    /**
     * The screen space error for this tile
     */
    declare __error: number;

    /**
     * How far is this tiles bounds from the nearest active Camera.
     * Expected to be filled in during calculateError implementations.
     */
    declare __distanceFromCamera: number;

    /**
     * This tile is currently active if:
     *  1: Tile content is loaded and ready to be made visible if needed
     */
    declare __active: boolean;

    /**
     * This tile is currently visible if:
     *  1: Tile content is loaded
     *  2: Tile is within a camera frustum
     *  3: Tile meets the SSE requirements
     */
    declare __visible: boolean;

    /**
     * Whether or not the tile was visited during the last update run.
     */
    declare __used: boolean;

    /**
     * Whether or not the tile was within the frustum on the last update run.
     */
    declare __inFrustum: boolean;

    /**
     * The depth of the tiles that increments only when a child with geometry content is encountered
     */
    declare __depthFromRenderedParent: number;

    declare __lastFrameVisited: number;

    private readonly _children: ITile[] = [];
    private _batchTable: Tile3DBatchTable | null = null;
    private _featureTable: Tile3DFeatureTable | null = null;

    /**
     * Creates a new Tile instance
     *
     * @param metadata - Metadata for the tile
     */
    constructor(private readonly metadata: Tiles3DTileContent | Tiles3DTileJSONPostprocessed) {
        super();
        this.__lastFrameVisited = 0;
        this.__used = false;
        this.__inFrustum = false;

        this._children = this.tiles3DTileJSONPostprocessed.children?.map(e => {
            return new Tile(e);
        });
    }

    /**
     * Rebinds tile content with new metadata
     *
     * @param metadata - New metadata to bind
     */
    protected rebindTileContent(metadata: Tiles3DTileContent) {
        const rawMetadata = this.metadata as Tiles3DTileContent;
        rawMetadata.batchTableJson = metadata.batchTableJson;
        rawMetadata.featureTableJson = metadata.featureTableJson;
        rawMetadata.featureTableBinary = metadata.featureTableBinary;
    }

    /**
     * Gets the tile content as Tiles3DTileContent
     */
    get tiles3DTileContent(): Tiles3DTileContent {
        return this.metadata as Tiles3DTileContent;
    }

    /**
     * Gets the tile content as Tiles3DTileJSONPostprocessed
     */
    get tiles3DTileJSONPostprocessed(): Tiles3DTileJSONPostprocessed {
        return this.metadata as Tiles3DTileJSONPostprocessed;
    }

    /**
     * Child tile references
     */
    override get children(): ITile[] {
        return this._children || [];
    }

    /**
     * Parent tile reference
     */
    declare parent?: ITile;

    /**
     * Extensions used by this tile
     */
    declare extensions?: Record<string, any>;

    /**
     * Gets the implicit tiling data for this tile
     */
    get implicitTiling(): ImplicitTilingData | undefined {
        return this.tiles3DTileJSONPostprocessed.implicitTiling;
    }

    /**
     * Gets the content metadata for this tile
     */
    get content() {
        return this.tiles3DTileJSONPostprocessed.content;
    }

    /**
     * Gets the transform matrix for this tile
     */
    get transform() {
        if (!this.tiles3DTileJSONPostprocessed.transform) {
            this.tiles3DTileJSONPostprocessed.transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        }
        return this.tiles3DTileJSONPostprocessed.transform;
    }

    /**
     * Gets the bounding volume for this tile
     */
    get boundingVolume() {
        return this.tiles3DTileJSONPostprocessed.boundingVolume as BoundingVolume;
    }

    /**
     * Cached data for the tile
     */
    declare cached: TileCache;

    /**
     * Gets the geometric error for this tile
     */
    get geometricError() {
        return this.tiles3DTileJSONPostprocessed.geometricError;
    }

    /**
     * Gets the refinement type for this tile
     */
    get refine() {
        return this.tiles3DTileJSONPostprocessed.refine as TILE_REFINEMENT;
    }

    /**
     * Sets the refinement type for this tile
     */
    set refine(value: TILE_REFINEMENT) {
        this.tiles3DTileJSONPostprocessed.refine = value;
    }

    /**
     * Gets the feature table object for this tile
     *
     * The feature table contains per-feature metadata for tile content.
     *
     * @returns The feature table object or null if not available
     */
    get featureTable(): Tile3DFeatureTable | null {
        // If the feature table object has already been created, return it
        if (this._featureTable) {
            return this._featureTable;
        }

        // Get feature table data from content and create feature table object
        const content = this.tiles3DTileContent;

        // Check if feature table data is available
        const hasFeatureTableData = content.featureTableJson || content.featureTableBinary;
        if (hasFeatureTableData) {
            // Create feature table object
            this._featureTable = new Tile3DFeatureTable(
                content.featureTableJson || {},
                content.featureTableBinary
            );

            // Set feature length
            if (content.featuresLength !== undefined) {
                this._featureTable.featuresLength = content.featuresLength;
            } else if (content.featureTableJson?.BATCH_LENGTH !== undefined) {
                this._featureTable.featuresLength = content.featureTableJson.BATCH_LENGTH;
            }

            return this._featureTable;
        }

        return null;
    }

    /**
     * Gets the batch length for this tile
     *
     * The batch length is used for batch table operations and represents
     * the number of features or instances in the tile.
     *
     * @returns The batch length
     */
    get batchLength(): number {
        const content = this.metadata as Tiles3DTileContent;

        // Prioritize getting batch length from header
        if (content.header?.batchLength !== undefined) {
            return content.header.batchLength;
        }

        // Get from featuresLength
        if (content.featuresLength !== undefined) {
            return content.featuresLength;
        }

        // Get from BATCH_LENGTH property
        if (content.featureTableJson?.BATCH_LENGTH !== undefined) {
            return content.featureTableJson.BATCH_LENGTH;
        }

        // Try to get batch length from scene
        if (this.cached?.scene && (this.cached.scene as any).batchLength !== undefined) {
            return (this.cached.scene as any).batchLength;
        }

        // Try to infer length from batch table
        if (this._batchTable) {
            // The length of the first property array in the batch table is typically the batch length
            const firstProperty = Object.values(this._batchTable._properties)[0];
            if (Array.isArray(firstProperty)) {
                return firstProperty.length;
            }
        }

        return 0;
    }

    /**
     * Gets the batch table object for this tile
     *
     * The batch table contains per-batch metadata for tile content.
     *
     * @returns The batch table object or null if not available
     */
    get batchTable(): Tile3DBatchTable | null {
        // If the batch table object has already been created, return it
        if (this._batchTable) {
            return this._batchTable;
        }

        // Get batch table data from content and create batch table object
        const content = this.metadata as Tiles3DTileContent;

        // Check if batch table data is available
        const hasBatchTableData = content.batchTableJson || content.batchTableBinary;
        if (hasBatchTableData) {
            // Get batch length
            const batchLength = this.batchLength;

            // Create batch table object
            this._batchTable = new Tile3DBatchTable(
                content.batchTableJson || {},
                content.batchTableBinary,
                batchLength
            );
            return this._batchTable;
        }

        return null;
    }

    /**
     * Gets all batch property names for this tile
     *
     * @returns Array of batch property names
     */
    getBatchPropertyNames(): string[] {
        if (this.batchTable) {
            return Object.keys(this.batchTable._properties);
        }
        return [];
    }

    /**
     * Gets batch properties by TileIntersection and batch name
     *
     * This method extracts the batch ID from a TileIntersection and uses it
     * to retrieve the corresponding batch properties.
     *
     * @param intersection - TileIntersection object
     * @param batchName - Name of the geometry attribute containing batch IDs (default: "_BATCHID")
     * @returns Record containing batch properties or undefined if not found
     */
    getBatchPropertiesByIntersection(
        intersection: TileIntersection,
        batchName: string = "_batchid"
    ): Record<string, any> {
        // Get batchId from intersection
        let batchId: number | undefined;

        // First try to get batchId from intersection's object
        // In 3D Tiles, batchId is typically stored in geometry attributes
        if (intersection.object && (intersection.object as any).geometry) {
            const geometry = (intersection.object as any).geometry;

            // Try to get the attribute corresponding to batchName from geometry attributes
            if (geometry.attributes && geometry.attributes[batchName]) {
                const attribute = geometry.attributes[batchName];

                // If it's a BufferAttribute, try to get the value at the corresponding index
                if (attribute && "array" in attribute) {
                    // Use intersection's index to get the batchId at the corresponding position
                    // If no index, use the a vertex index of the face (for triangular faces)
                    let index = 0;
                    if (intersection.index !== undefined) {
                        index = intersection.index;
                    } else if (intersection.face) {
                        // Use the first vertex index of the face
                        index = intersection.face.a;
                    }

                    if (index < attribute.array.length) {
                        batchId = Math.round(attribute.array[index]);
                    }
                }
            }
        }

        // If we haven't gotten batchId yet, try to get it from intersection's batchId property (defined by Three.js)
        if (batchId === undefined && intersection.batchId !== undefined) {
            batchId = intersection.batchId;
        }

        // If we haven't gotten batchId yet, try to get it from instanceId (for InstancedMesh)
        if (batchId === undefined && intersection.instanceId !== undefined) {
            batchId = intersection.instanceId;
        }

        // If we haven't gotten batchId yet, try to get it from face's materialIndex (may store batchId in some cases)
        if (
            batchId === undefined &&
            intersection.face &&
            intersection.face.materialIndex !== undefined
        ) {
            batchId = intersection.face.materialIndex;
        }

        // If we successfully got batchId, call getBatchProperty to get the property values
        if (batchId !== undefined && batchId >= 0 && batchId < this.batchLength) {
            return this.getBatchProperties(batchId);
        }

        return undefined;
    }

    /**
     * Gets the property value for a specific batch ID
     *
     * @param batchId - The batch ID
     * @param propertyName - The name of the property to retrieve
     * @returns The property value or undefined if not found
     */
    getBatchProperty(batchId: number, propertyName: string): any {
        if (this.batchTable && batchId >= 0 && batchId < this.batchLength) {
            return this.batchTable.getProperty(batchId, propertyName);
        }
        return undefined;
    }

    /**
     * Gets all property values for a specific batch ID
     *
     * @param batchId - The batch ID
     * @param customAttributeConfig - Custom attribute configuration for property mapping
     * @returns Record containing all properties for the batch ID
     */
    getBatchProperties(
        batchId: number,
        customAttributeConfig?: {
            attributeMappings?: Record<string, string>;
        }
    ): Record<string, any> {
        const properties: Record<string, any> = { batchId };

        // Get batch table data
        const batchTable = this.batchTable;
        if (!batchTable || !batchTable._properties) {
            return properties;
        }

        // Add mapped property names
        if (customAttributeConfig?.attributeMappings) {
            Object.keys(customAttributeConfig.attributeMappings).forEach(mappedName => {
                const originalName = customAttributeConfig.attributeMappings[mappedName];
                if (originalName && batchTable._properties[originalName]) {
                    const propertyArray = batchTable._properties[originalName];
                    if (Array.isArray(propertyArray) && batchId < propertyArray.length) {
                        properties[mappedName] = propertyArray[batchId];
                    }
                }
            });
        }

        // Process regular properties
        Object.keys(batchTable._properties).forEach(propertyName => {
            // Skip special properties
            if (propertyName === "HIERARCHY") {
                return;
            }

            const propertyArray = batchTable._properties[propertyName];
            if (Array.isArray(propertyArray) && batchId < propertyArray.length) {
                properties[propertyName] = propertyArray[batchId];
            } else if (typeof propertyArray !== "object") {
                // Single value property, shared by all batches
                properties[propertyName] = propertyArray;
            }
        });

        // Process HIERARCHY extension properties
        this.extractHierarchyProperties(batchTable, batchId, properties);

        return properties;
    }

    /**
     * Extracts HIERARCHY extension properties
     *
     * @param batchTable - Batch table data
     * @param batchId - Batch ID
     * @param properties - Properties object to populate
     */
    private extractHierarchyProperties(
        batchTable: any,
        batchId: number,
        properties: Record<string, any>
    ): void {
        // Check if HIERARCHY extension exists
        const hierarchyExtension =
            batchTable._extensions?.["3DTILES_batch_table_hierarchy"] || batchTable.json?.HIERARCHY;
        if (!hierarchyExtension) {
            return;
        }

        const { classes, instances, classIds } = hierarchyExtension;

        // Check if batchId is within valid range
        if (instances && batchId >= instances.length) {
            return;
        }
        if (classIds && batchId >= classIds.length) {
            return;
        }

        let currentInstanceId = 0;
        let currentClassId = 0;
        // Get information for the current instance
        if (instances) {
            const instance = instances[batchId];
            const { classId, instanceId } = instance;

            currentClassId = classId;
            currentInstanceId = instanceId;
        } else {
            currentClassId = classIds[batchId];
            currentInstanceId = 0;
        }

        // Check if classId is within valid range
        if (currentClassId >= classes.length) {
            return;
        }

        // Get information for the current class
        const classInfo = classes[currentClassId];

        // Add properties of the current class to properties
        const classInstances = classInfo.instances;
        Object.keys(classInstances).forEach(propertyName => {
            // Skip special properties
            if (propertyName === "parentId") {
                return;
            }

            const propertyArray = classInstances[propertyName];
            if (Array.isArray(propertyArray) && currentInstanceId < propertyArray.length) {
                // If the property is not yet defined in properties, add it
                if (properties[propertyName] === undefined) {
                    properties[propertyName] = propertyArray[currentInstanceId];
                }
            }
        });

        // Process inherited properties (through parentId)
        this.extractInheritedProperties(
            hierarchyExtension,
            currentClassId,
            currentInstanceId,
            properties
        );
    }

    /**
     * Extracts inherited properties
     *
     * @param hierarchy - HIERARCHY extension data
     * @param classId - Class ID
     * @param instanceId - Instance ID
     * @param properties - Properties object to populate
     */
    private extractInheritedProperties(
        hierarchy: any,
        classId: number,
        instanceId: number,
        properties: Record<string, any>
    ): void {
        const { classes } = hierarchy;
        let currentClassId = classId;
        let currentInstanceId = instanceId;

        // Traverse the inheritance chain
        while (currentClassId < classes.length) {
            const classInfo = classes[currentClassId];
            const classInstances = classInfo.instances;

            // Check if parentId property exists
            const parentIds = classInstances.parentId;
            if (!parentIds || !Array.isArray(parentIds) || currentInstanceId >= parentIds.length) {
                break;
            }

            const parentId = parentIds[currentInstanceId];

            // If parentId equals currentInstanceId, it means there is no parent
            if (parentId === currentInstanceId) {
                break;
            }

            // Find parent class and instance
            // In HIERARCHY, parentId points to the index of the parent instance in the parent class

            // Traverse all classes to find the parent
            let foundParent = false;
            for (let parentClassId = 0; parentClassId < classes.length; parentClassId++) {
                const parentClass = classes[parentClassId];
                const parentClassInstances = parentClass.instances;

                // Check if the parent class has enough instances
                const firstProperty = Object.values(parentClassInstances)[0];
                if (Array.isArray(firstProperty) && parentId < firstProperty.length) {
                    // Add the parent class's properties to properties (only if the property is not yet defined)
                    Object.keys(parentClassInstances).forEach(propertyName => {
                        // Skip special properties
                        if (propertyName === "parentId") {
                            return;
                        }

                        const propertyArray = parentClassInstances[propertyName];
                        if (Array.isArray(propertyArray) && parentId < propertyArray.length) {
                            // If the property is not yet defined in properties, add it
                            if (properties[propertyName] === undefined) {
                                properties[propertyName] = propertyArray[parentId];
                            }
                        }
                    });

                    // Update current class and instance ID to continue traversing the inheritance chain
                    currentClassId = parentClassId;
                    currentInstanceId = parentId;
                    foundParent = true;
                    break;
                }
            }

            // If no parent is found, exit the loop
            if (!foundParent) {
                break;
            }
        }
    }

    /**
     * Gets all feature table property names for this tile
     *
     * @returns Array of feature property names
     */
    getFeaturePropertyNames(): string[] {
        if (this.featureTable) {
            return Object.keys(this.featureTable.json);
        }
        return [];
    }

    /**
     * Gets the property value for a specific feature ID
     *
     * @param propertyName - Name of the property to retrieve
     * @param componentType - Component type (default: GL.UNSIGNED_INT)
     * @param componentLength - Component length (default: 1)
     * @param featureId - Feature ID
     * @param result - Optional result object to populate
     * @returns The property value or undefined if not found
     */
    getFeatureProperty(
        propertyName: string,
        componentType: number = GL.UNSIGNED_INT,
        componentLength: number = 1,
        featureId: number,
        result?: any
    ): any {
        if (this.featureTable) {
            return this.featureTable.getProperty(
                propertyName,
                componentType,
                componentLength,
                featureId,
                result
            );
        }
        return undefined;
    }

    /**
     * Gets a global property from the feature table
     *
     * @param propertyName - Name of the property to retrieve
     * @param componentType - Component type (default: GL.UNSIGNED_INT)
     * @param componentLength - Component length (default: 1)
     * @returns The property value or undefined if not found
     */
    getFeatureGlobalProperty(
        propertyName: string,
        componentType: number = GL.UNSIGNED_INT,
        componentLength: number = 1
    ): any {
        if (this.featureTable) {
            return this.featureTable.getGlobalProperty(
                propertyName,
                componentType,
                componentLength
            );
        }
        return undefined;
    }
}

/**
 * Subtree tile implementation for implicit tiling
 *
 * This class represents a tile within an implicit tiling subtree structure.
 */
export class SubTreeTile extends TileInternal {
    private _content: Tiles3DTileContentJSON;

    /**
     * Gets the content metadata for this tile
     */
    get content(): Tiles3DTileContentJSON {
        return this._content;
    }

    /**
     * Sets the content metadata for this tile
     */
    set content(value: Tiles3DTileContentJSON) {
        this._content = value;
    }

    private readonly _children: SubTreeTile[] = [];

    /**
     * Gets the child tiles for this tile
     */
    get children(): SubTreeTile[] {
        return this._children;
    }

    /**
     * Gets the implicit tiling data for this tile
     */
    get implicitTiling(): ImplicitTilingData {
        throw new Error("Method not implemented.");
    }

    /**
     * Gets the transform matrix for this tile
     */
    get transform(): number[] {
        throw new Error("Method not implemented.");
    }

    private _boundingVolume: BoundingVolume;

    /**
     * Gets the bounding volume for this tile
     */
    get boundingVolume(): BoundingVolume {
        return this._boundingVolume;
    }

    /**
     * Sets the bounding volume for this tile
     */
    set boundingVolume(value: BoundingVolume) {
        this._boundingVolume = value;
    }

    private _geometricError: number;

    /**
     * Gets the geometric error for this tile
     */
    get geometricError(): number {
        return this._geometricError;
    }

    /**
     * Sets the geometric error for this tile
     */
    set geometricError(value: number) {
        this._geometricError = value;
    }

    /**
     * Gets the refinement type for this tile
     */
    get refine(): TILE_REFINEMENT {
        throw new Error("Method not implemented.");
    }

    __implicitRoot: SubTreeTile;
    __subtreeIdx: number;
    __x: number;
    __y: number;
    __z: number;
    __level: number;

    /**
     * Creates a new SubTreeTile instance
     *
     * @param config - Configuration for the subtree tile
     */
    constructor(config?: {
        parent: SubTreeTile;
        __subtreeIdx: number;
        __x: number;
        __y: number;
        __z: number;
        __level: number;
    }) {
        super();
        if (config) {
            this.parent = config.parent;
            this.__subtreeIdx = config.__subtreeIdx;
            this.__x = config.__x;
            this.__y = config.__y;
            this.__z = config.__z;
            this.__level = config.__level;
        }
    }
}

/**
 * Tile set representation
 *
 * This class represents a complete 3D Tiles tileset, including the root tile
 * and metadata about the tileset as a whole.
 */
export class TileSet {
    /**
     * The root tile of the tileset
     */
    root: ITile;

    /**
     * Creates a new TileSet instance
     *
     * @param meta - Metadata for the tileset
     */
    constructor(private readonly meta: Tiles3DTilesetJSONPostprocessed) {
        this.root = new Tile(meta.root);
    }

    /**
     * Gets the asset metadata for the tileset
     */
    get asset() {
        return this.meta.asset;
    }

    /**
     * Gets the geometric error for the tileset
     */
    get geometricError() {
        return this.meta.geometricError;
    }

    /**
     * Gets the extensions used by the tileset
     */
    get extensionsUsed() {
        return this.meta.extensionsUsed;
    }

    /**
     * Gets the extensions required by the tileset
     */
    get extensionsRequired() {
        return this.meta.extensionsRequired;
    }

    /**
     * Gets the properties metadata for the tileset
     */
    get properties() {
        return this.meta.properties;
    }

    /**
     * Gets the extensions metadata for the tileset
     */
    get extensions() {
        return this.meta.extensions;
    }

    /**
     * Gets the extras metadata for the tileset
     */
    get extras() {
        return this.meta.extras;
    }
}
