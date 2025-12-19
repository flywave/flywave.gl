/* Copyright (C) 2025 flywave.gl contributors */

import { Style, type FlatTheme, type StyleSet, type Theme } from "@flywave/flywave-datasource-protocol";
import { type StyleSetOptions } from "@flywave/flywave-datasource-protocol/StyleSetEvaluator";
import { type IMapRenderingManager } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { type ITile, Tile } from "../base/Tile";
import { B3DMBatchMaterial } from "../materials/B3DMBatchMaterial";
import { Observe3DTileChange } from "../ObserveTileChange";
import { FlatThemeExtra, ThemeExtra, type BatchAnimation } from "../TileRenderDataSource";
import { BatchStyleProcessor } from "./BatchStyleProcessor";

/**
 * Configuration interface for custom attributes
 */
export interface CustomAttributeConfig {
    /**
     * Batch ID attribute name
     */
    batchIdAttributeName?: string;

    /**
     * Attribute mapping configuration
     */
    attributeMappings?: Record<string, string>;
}

/**
 * B3DM tile feature interface
 */
interface B3DMTileFeature {
    /** Tile identifier */
    tileId: string;
    /** Batch table data */
    batchTable: Record<string, any>;
    /** Batch length */
    batchLength: number;
    /** 3D object containing B3DM geometry */
    object3D: THREE.Object3D;
    /** Batch ID attribute from geometry */
    batchIdAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
}

/**
 * I3DM tile feature interface
 */
interface I3DMTileFeature {
    /** Tile identifier */
    tileId: string;
    /** Feature table data */
    featureTable: Record<string, any>;
    /** Batch table data */
    batchTable: Record<string, any> | null;
    /** Instance count */
    instanceCount: number;
    /** Array of instanced objects */
    instancedObjects: THREE.Object3D[];
}

/**
 * Hierarchy extension interface definition
 */
interface HierarchyExtension {
    classes: Array<{
        name: string;
        length: number;
        instances: Record<string, any[]>;
    }>;
    instances: Array<{
        classId: number;
        instanceId: number;
    }>;
    classIds?: number[];
}

/**
 * Batch table data interface supporting HIERARCHY extension
 */
interface BatchTableData {
    [key: string]: any;
    extensions?: {
        "3DTILES_batch_table_hierarchy"?: HierarchyExtension;
    };
}

/**
 * 3D Tiles style watcher
 * Responsible for monitoring tile loading events and automatically applying styles
 * Implements GLSL-based B3DM/I3DM batch rendering
 */
export class Tiles3DStyleWatcher extends Observe3DTileChange {
    private m_styleEvaluator: BatchStyleProcessor;

    private readonly m_appliedMaterials = new Map<string, B3DMBatchMaterial[]>();
    private readonly m_tileFeatures = new Map<string, B3DMTileFeature | I3DMTileFeature>();
    private readonly m_customAttributeConfig: {
        batchIdAttributeName: string;
        attributeMappings: Record<string, string>;
    };

    /**
     * Constructor
     * @param theme - Theme configuration
     * @param styleSetName - Style set name used to select style set from styles
     * @param m_mapRenderingManager - Map rendering manager instance
     * @param customAttributeConfig - Custom attribute configuration, optional
     * @param animation - Batch animation configuration
     */
    constructor(
        private theme: ThemeExtra | FlatThemeExtra,
        private readonly styleSetName?: string,
        private readonly m_mapRenderingManager?: IMapRenderingManager,
        customAttributeConfig?: CustomAttributeConfig,
        private readonly animation?: BatchAnimation
    ) {
        // Initialize parent class with notification callback
        super((tile: ITile, active: boolean) => {
            if (active) {
                this.onTileLoaded(tile);
            } else {
                this.onTileUnloaded(tile);
            }
        });

        this.updateTheme(theme);

        // Initialize custom attribute configuration
        // Use provided configuration or default values
        this.m_customAttributeConfig = {
            batchIdAttributeName: customAttributeConfig?.batchIdAttributeName || "_batchid",
            attributeMappings: customAttributeConfig?.attributeMappings || {}
        };
    }

    /**
     * Updates the theme configuration
     * @param theme - New theme configuration
     */
    updateTheme(theme: ThemeExtra | FlatThemeExtra): void {
        this.theme = theme;
        // Select style set using styleSetName
        let styleSet: StyleSet = [];

        // If styleSetName is specified
        if (this.styleSetName) {
            // Select corresponding style set
            if (theme.styles && theme.styles[this.styleSetName]) {
                styleSet = theme.styles[this.styleSetName];
            }
        }

        // Create style evaluator options
        const styleSetOptions: StyleSetOptions = {
            styleSet
        };

        this.m_styleEvaluator = new BatchStyleProcessor(styleSetOptions);

        this.m_mapRenderingManager?.addTranslucentLayer(this.observeId, theme?.postEffects?.translucentDepth || {
            mixFactor: 0.5,
            blendMode: "mix"
        });

        this.nodifyActiveTiles();
    }


    /**
     * Add a new style to the style set.
     *
     * @param style - The style to add.
     * @returns The added style with generated identifier if needed.
     */
    addStyle(style: Style): Style {
        let result = this.styleEvaluator.addStyle(style);
        this.nodifyActiveTiles();
        return result;
    }


    /**
     * Remove style by its identifier.
     *
     * @param id - The style identifier.
     * @returns `true` if style was found and removed, `false` otherwise.
     */
    removeStyleById(id: string): boolean {
        let result = this.styleEvaluator.removeStyleById(id);
        this.nodifyActiveTiles();
        return result;
    }


    /**
     * Update style properties by its identifier.
     *
     * @param id - The style identifier.
     * @param updates - The style properties to update.
     * @returns `true` if style was found and updated, `false` otherwise.
     */
    updateStyleById(id: string, updates: Partial<Style>): boolean {
        let result = this.styleEvaluator.updateStyleById(id, updates);
        this.nodifyActiveTiles();
        return result;
    }

    get styleEvaluator(): BatchStyleProcessor {
        return this.m_styleEvaluator;
    }

    /**
     * Applies translucent depth effect configuration
     * @param object - 3D object to apply effect to
     */
    private applyRenderEffectConfig(object: THREE.Object3D): void {
        // Check if theme has tile3DRender and postEffects configuration
        const isTranslucentDepthEnabled = this.theme?.postEffects?.translucentDepth?.enabled;
        const isBloomEnabled = this.theme?.postEffects?.bloom?.enabled;
        if (isTranslucentDepthEnabled !== undefined || isBloomEnabled !== undefined) {
            object.traverse(child => {
                if (child && (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh)) {
                    if (isTranslucentDepthEnabled)
                        this.m_mapRenderingManager?.addTranslucentObject(child, this.observeId);
                    else
                        this.m_mapRenderingManager?.removeTranslucentObject(child);
                    if (isBloomEnabled)
                        this.m_mapRenderingManager?.addBloomObject(child);
                    else
                        this.m_mapRenderingManager?.removeBloomObject(child);
                }
            });

        }
    }

    /**
     * Handles tile loaded event
     * @param tile - Loaded tile instance
     */
    onTileLoaded(tile: ITile): void {
        try {
            const tileId = this.getTileId(tile);

            // Extract tile features
            const tileFeature = this.extractTileFeature(tile);
            if (!tileFeature) {
                // console.warn(`Unsupported tile format: ${tileId}`);
                return;
            }

            this.m_tileFeatures.set(tileId, tileFeature);

            // Apply batch rendering material for B3DM format
            if (this.isB3DMFeature(tileFeature)) {
                this.applyB3DMBatchMaterial(tileFeature, tile);
            }
            // Apply instance material for I3DM format
            else if (this.isI3DMFeature(tileFeature)) {
                this.applyI3DMInstanceMaterial(tileFeature, tile);
            }

            if (this.m_mapRenderingManager) this.applyRenderEffectConfig(tile.cached.scene);
        } catch (error) {
            console.warn("Failed to apply styles to tile:", error);
        }
    }

    /**
     * Handles tile unloaded event
     * @param tile - Unloaded tile instance
     */
    onTileUnloaded(tile: ITile): void {
        const tileId = this.getTileId(tile);

        // Restore original materials for meshes
        this.restoreOriginalMaterials(tileId, tile);

        // Clean up material resources
        const material = this.m_appliedMaterials.get(tileId);
        if (material) {
            material.forEach(mat => {
                mat.dispose();
            });
            this.m_appliedMaterials.delete(tileId);
        }

        // Clean up feature data
        this.m_tileFeatures.delete(tileId);
    }

    /**
     * Extracts tile feature data
     * @param tile - Tile instance to extract features from
     * @returns Tile feature data or null if unsupported format
     */
    private extractTileFeature(tile: ITile): B3DMTileFeature | I3DMTileFeature | null {
        if (!tile.cached?.scene) {
            return null;
        }

        const tileId = this.getTileId(tile);

        // Check for B3DM format
        const b3dmFeature = this.extractB3DMFeature(tile, tileId);
        if (b3dmFeature) {
            return b3dmFeature;
        }

        // Check for I3DM format
        const i3dmFeature = this.extractI3DMFeature(tile, tileId);
        if (i3dmFeature) {
            return i3dmFeature;
        }

        return null;
    }

    /**
     * Extracts B3DM feature data
     * @param tile - Tile instance
     * @param tileId - Tile identifier
     * @returns B3DM feature data or null if not B3DM format
     */
    private extractB3DMFeature(tile: ITile, tileId: string): B3DMTileFeature | null {
        // Check cached data
        if (!tile.cached) {
            return null;
        }

        const scene = tile.cached.scene;

        // Get batch table data
        const batchTable = this.getBatchTableData(tile);
        if (!batchTable) {
            return null;
        }

        const batchLength = this.getBatchLength(tile);
        if (batchLength === 0) {
            return null;
        }

        // Use geometry and materials from tile.cached to get data
        let batchIdAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null =
            null;
        let targetObject: THREE.Object3D | null = null;
        let targetMesh: THREE.Mesh | null = null;

        // Traverse cached geometry and corresponding materials
        if (tile.cached.geometry && tile.cached.materials) {
            // Find geometry containing custom attribute name
            for (let i = 0; i < tile.cached.geometry.length; i++) {
                const geometry = tile.cached.geometry[i];

                // Find custom attribute name
                const customAttributeName = this.m_customAttributeConfig.batchIdAttributeName;
                const attr =
                    geometry.getAttribute(customAttributeName) ||
                    geometry.getAttribute(customAttributeName.toLowerCase()) ||
                    geometry.getAttribute(customAttributeName.toUpperCase());

                if (attr) {
                    batchIdAttribute = attr;

                    // Find corresponding mesh object
                    scene.traverse((object: THREE.Object3D) => {
                        if (object.type === "Mesh") {
                            const mesh = object as THREE.Mesh;
                            if (mesh.geometry === geometry) {
                                targetObject = object;
                                targetMesh = mesh;
                                return false; // Stop traversal
                            }
                        }
                    });
                    break;
                }
            }
        } else {
            // Fallback to original traversal method
            scene.traverse((object: THREE.Object3D) => {
                if (object.type === "Mesh") {
                    const mesh = object as THREE.Mesh;
                    const geometry = mesh.geometry as THREE.BufferGeometry;

                    // Find custom attribute name
                    const customAttributeName = this.m_customAttributeConfig.batchIdAttributeName;
                    const attr =
                        geometry.getAttribute(customAttributeName) ||
                        geometry.getAttribute(customAttributeName.toLowerCase()) ||
                        geometry.getAttribute(customAttributeName.toUpperCase());

                    if (attr) {
                        batchIdAttribute = attr;
                        targetObject = object;
                        targetMesh = mesh;
                        return false; // Stop traversal
                    }
                }
            });
        }

        if (!batchIdAttribute || !targetObject) {
            // console.warn(
            //     `B3DM tile ${tileId} has batchTable but no ${this.m_customAttributeConfig.batchIdAttributeName} attribute found`
            // );
            return null;
        }

        return {
            tileId,
            batchTable,
            batchLength,
            object3D: targetObject,
            batchIdAttribute
        };
    }

    /**
     * Extracts I3DM feature data
     * @param tile - Tile instance
     * @param tileId - Tile identifier
     * @returns I3DM feature data or null if not I3DM format
     */
    private extractI3DMFeature(tile: ITile, tileId: string): I3DMTileFeature | null {
        const scene = tile.cached!.scene;

        // I3DM may have instance table or feature table
        const featureTable = this.getFeatureTableData(tile);
        const batchTable = this.getBatchTableData(tile);

        const instanceCount = this.getInstancesLength(tile);
        if (instanceCount === 0) {
            return null;
        }

        // Find instanced objects
        const instancedObjects: THREE.Object3D[] = [];
        scene.traverse((object: THREE.Object3D) => {
            // Check if object is an instanced object
            if (object instanceof THREE.InstancedMesh) {
                instancedObjects.push(object);
            }
        });

        if (instancedObjects.length === 0) {
            return null;
        }

        return {
            tileId,
            featureTable: featureTable || {},
            batchTable,
            instanceCount,
            instancedObjects
        };
    }

    /**
     * Applies batch rendering material for B3DM format
     * @param feature - B3DM feature data
     * @param tile - Tile instance (optional)
     */
    private applyB3DMBatchMaterial(feature: B3DMTileFeature, tile?: ITile): void {
        const { tileId, batchTable, batchLength, object3D } = feature;

        // Create or get batch materials
        let batchMaterials = this.m_appliedMaterials.get(tileId);
        const isCached = !!batchMaterials;
        if (!batchMaterials) {
            batchMaterials = tile!.cached.materials.map((origin: THREE.MeshStandardMaterial) => {
                const batchMaterial = new B3DMBatchMaterial({
                    materialParams: {
                        ...this.theme?.materialParameters,
                        color: origin.color,
                        map: origin.map,
                        normalMap: origin.normalMap,
                        roughnessMap: origin.roughnessMap,
                        emissive: origin.emissive,
                        transparent: true,
                        depthWrite: true,
                        metalness: origin.metalness,
                        userData: {
                            originUUID: origin.uuid
                        }
                    },
                    batchIdAttributeName: this.m_customAttributeConfig.batchIdAttributeName,
                    animation: this.animation
                });

                const rawOnBeforeRender = batchMaterial.onBeforeRender;
                batchMaterial.onBeforeRender = (
                    renderer: THREE.WebGLRenderer,
                    scene: THREE.Scene,
                    camera: THREE.Camera,
                    geometry: THREE.BufferGeometry,
                    object: THREE.Object3D,
                    group: THREE.Group
                ) => {
                    rawOnBeforeRender?.call(
                        batchMaterial,
                        renderer,
                        scene,
                        camera,
                        geometry,
                        object,
                        group
                    );
                    if (this.theme?.onMatrialRender) {
                        this.theme?.onMatrialRender?.call(
                            batchMaterial,
                            renderer,
                            scene,
                            camera,
                            geometry,
                            object,
                            group
                        );
                    }
                };
                batchMaterial.userData.originUUID = origin.uuid;
                return batchMaterial;
            });
            this.m_appliedMaterials.set(tileId, batchMaterials);
        }

        // Evaluate and apply styles for each batchId
        const batchStyles = new Map<number, any>();

        for (let batchId = 0; batchId < batchLength; batchId++) {
            // Extract current batch properties
            let batchProperties: Record<string, any> = { batchId };

            // If tile object is provided, use tile's getBatchProperties method
            if (tile && tile instanceof Tile) {
                batchProperties = (tile as Tile).getBatchProperties(
                    batchId,
                    this.m_customAttributeConfig
                );
            } else {
                // Otherwise use original implementation
                batchProperties = this.extractBatchProperties(batchTable, batchId);
            }

            // Use style evaluator to compute style, passing appropriate layer and geometryType parameters
            const batchStyle = this.m_styleEvaluator.getBatchStyle(
                batchProperties,
                "3dtiles",
                "mesh"
            );

            // Convert to B3DM batch style
            const b3dmStyle = batchStyle;
            batchStyles.set(batchId, b3dmStyle);
        }

        // Apply batch styles to materials
        batchMaterials.forEach(material => {
            material.setBatchStyles(batchStyles);
        });

        if (!isCached) {
            // Use improved method to apply materials to object
            if (tile) {
                this.applyMaterialToCachedGeometry(tile, batchMaterials);
            } else {
                this.applyMaterialToObject(object3D, batchMaterials);
            }
        }
    }

    /**
     * Applies instance materials for I3DM format
     * Handles instanced rendering with per-instance styling
     * @param feature - I3DM feature data
     * @param tile - Tile instance
     */
    private applyI3DMInstanceMaterial(feature: I3DMTileFeature, tile: ITile): void {
        const { tileId, batchTable, instanceCount, instancedObjects } = feature;

        // Create or get batch materials for this tile
        let batchMaterials = this.m_appliedMaterials.get(tileId);
        const isCached = !!batchMaterials;

        if (!batchMaterials) {
            // Create batch materials for each instanced object
            batchMaterials = instancedObjects.map((instancedObject: THREE.Object3D) => {
                // Find the mesh within the instanced object
                let targetMesh: THREE.Mesh | null = null;
                instancedObject.traverse((child: THREE.Object3D) => {
                    if (child.type === "Mesh" && !targetMesh) {
                        targetMesh = child as THREE.Mesh;
                    }
                });

                if (!targetMesh) {
                    return null;
                }

                const originalMaterial = targetMesh.material as THREE.MeshStandardMaterial;

                const batchMaterial = new B3DMBatchMaterial({
                    materialParams: {
                        ...this.theme?.materialParameters,
                        color: originalMaterial.color,
                        map: originalMaterial.map,
                        normalMap: originalMaterial.normalMap,
                        roughnessMap: originalMaterial.roughnessMap,
                        emissive: originalMaterial.emissive,
                        transparent: true,
                        depthWrite: true,
                        metalness: originalMaterial.metalness,
                        userData: {
                            originUUID: originalMaterial.uuid,
                            instanceId: instancedObject.userData.instanceId
                        }
                    },
                    batchIdAttributeName: this.m_customAttributeConfig.batchIdAttributeName,
                    animation: this.animation
                });

                // Set up custom rendering callback
                const rawOnBeforeRender = batchMaterial.onBeforeRender;
                batchMaterial.onBeforeRender = (
                    renderer: THREE.WebGLRenderer,
                    scene: THREE.Scene,
                    camera: THREE.Camera,
                    geometry: THREE.BufferGeometry,
                    object: THREE.Object3D,
                    group: THREE.Group
                ) => {
                    rawOnBeforeRender?.call(
                        batchMaterial,
                        renderer,
                        scene,
                        camera,
                        geometry,
                        object,
                        group
                    );
                    if (this.theme?.onMatrialRender) {
                        this.theme.onMatrialRender.call(
                            batchMaterial,
                            renderer,
                            scene,
                            camera,
                            geometry,
                            object,
                            group
                        );
                    }
                };

                batchMaterial.userData.originUUID = originalMaterial.uuid;
                batchMaterial.userData.instanceId = instancedObject.userData.instanceId;

                return batchMaterial;
            }).filter((material): material is B3DMBatchMaterial => material !== null);

            if (batchMaterials.length > 0) {
                this.m_appliedMaterials.set(tileId, batchMaterials);
            } else {
                return;
            }
        }

        // Evaluate and apply styles for each instance
        const batchStyles = new Map<number, any>();

        for (let instanceId = 0; instanceId < instanceCount; instanceId++) {
            // Extract properties for current instance
            let instanceProperties: Record<string, any> = {
                batchId: instanceId,
                instanceId: instanceId
            };

            // Extract properties from feature table and batch table
            const featureTableProperties = this.extractInstanceProperties(feature, instanceId);
            const batchTableProperties = this.extractBatchProperties(batchTable || {}, instanceId);

            // Merge all properties
            instanceProperties = {
                ...instanceProperties,
                ...featureTableProperties,
                ...batchTableProperties
            };

            // Use style evaluator to compute style for this instance
            const instanceStyle = this.m_styleEvaluator.getBatchStyle(
                instanceProperties,
                "3dtiles",
                "mesh"
            );

            // Convert to B3DM batch style format
            const b3dmStyle = instanceStyle;
            batchStyles.set(instanceId, b3dmStyle);
        }

        // Apply batch styles to all materials
        batchMaterials.forEach(material => {
            material.setBatchStyles(batchStyles);
        });

        // Apply materials to instanced objects if not cached
        if (!isCached) {
            if (tile) {
                this.applyMaterialToCachedGeometry(tile, batchMaterials);
            } else {
                this.applyMaterialToInstancedObjects(feature, batchMaterials);
            }
        }
    }

    /**
     * Extracts properties for a specific instance from I3DM feature tables
     * @param feature - I3DM feature data
     * @param instanceId - Instance identifier
     * @returns Instance properties object
     */
    private extractInstanceProperties(feature: I3DMTileFeature, instanceId: number): Record<string, any> {
        const properties: Record<string, any> = {
            batchId: instanceId
        };

        // Extract from feature table
        if (feature.featureTable) {
            Object.keys(feature.featureTable).forEach(propertyName => {
                const propertyValue = feature.featureTable[propertyName];
                if (Array.isArray(propertyValue) && instanceId < propertyValue.length) {
                    properties[propertyName] = propertyValue[instanceId];
                } else if (typeof propertyValue !== 'object') {
                    // Single value property shared by all instances
                    properties[propertyName] = propertyValue;
                }
            });
        }

        // Extract instance-specific data from instanced objects
        if (instanceId < feature.instancedObjects.length) {
            const instanceObject = feature.instancedObjects[instanceId];

            // Extract transform information
            if (instanceObject.matrix) {
                properties.matrix = instanceObject.matrix;
            }

            // Extract position, rotation, scale
            properties.position = instanceObject.position.clone();
            properties.rotation = instanceObject.rotation.clone();
            properties.scale = instanceObject.scale.clone();

            // Extract user data
            if (instanceObject.userData) {
                Object.keys(instanceObject.userData).forEach(key => {
                    if (key !== 'originalMaterial') {
                        properties[key] = instanceObject.userData[key];
                    }
                });
            }
        }

        return properties;
    }

    /**
     * Applies batch materials to instanced objects
     * @param feature - I3DM feature data
     * @param materials - Batch materials to apply
     */
    private applyMaterialToInstancedObjects(feature: I3DMTileFeature, materials: B3DMBatchMaterial[]): void {
        feature.instancedObjects.forEach((instancedObject: THREE.Object3D, index: number) => {
            instancedObject.traverse((child: THREE.Object3D) => {
                if (child.type === "Mesh") {
                    const mesh = child as THREE.Mesh;

                    // Save original material for restoration
                    if (!mesh.userData.originalMaterial) {
                        mesh.userData.originalMaterial = mesh.material;
                    }

                    // Find appropriate material for this instance
                    const instanceMaterial = materials.find(material =>
                        material.userData.instanceId === instancedObject.userData.instanceId
                    ) || materials[index % materials.length];

                    if (instanceMaterial) {
                        mesh.material = instanceMaterial;
                    }
                }
            });
        });
    }

    /**
     * Extracts batch properties from batch table data
     * @param batchTable - Batch table data
     * @param batchId - Batch identifier
     * @returns Batch properties object
     */
    private extractBatchProperties(
        batchTable: BatchTableData,
        batchId: number
    ): Record<string, any> {
        const properties: Record<string, any> = { batchId };

        // Add mapped attribute names
        // Map original attribute names to new mapped names for styling
        Object.keys(this.m_customAttributeConfig.attributeMappings).forEach(originalName => {
            const mappedName = this.m_customAttributeConfig.attributeMappings[originalName];
            if (mappedName && batchTable.json && batchTable.json[originalName]) {
                const propertyArray = batchTable.json[originalName];
                if (Array.isArray(propertyArray) && batchId < propertyArray.length) {
                    properties[mappedName] = propertyArray[batchId];
                }
            }
        });

        // Process regular properties
        Object.keys(batchTable.json).forEach(propertyName => {
            // Skip special properties
            if (propertyName === "HIERARCHY") {
                return;
            }

            const propertyArray = batchTable.json[propertyName];
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
     * @param batchTable - Batch table data
     * @param batchId - Batch identifier
     * @param properties - Properties object to populate
     */
    private extractHierarchyProperties(
        batchTable: BatchTableData,
        batchId: number,
        properties: Record<string, any>
    ): void {
        // Check if HIERARCHY extension exists
        const hierarchyExtension =
            batchTable.extensions?.["3DTILES_batch_table_hierarchy"] || batchTable.json?.HIERARCHY;
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
        // Get current instance information
        if (instances) {
            const instance = instances[batchId];
            const { classId, instanceId } = instance;

            currentClassId = classId;
            currentInstanceId = instanceId;
        } else {
            currentClassId = classIds![batchId];
            currentInstanceId = 0;
        }

        // Check if classId is within valid range
        if (currentClassId >= classes.length) {
            return;
        }

        // Get current class information
        const classInfo = classes[currentClassId];

        // Add current class properties to properties object
        const classInstances = classInfo.instances;
        Object.keys(classInstances).forEach(propertyName => {
            // Skip special properties
            if (propertyName === "parentId") {
                return;
            }

            const propertyArray = classInstances[propertyName];
            if (Array.isArray(propertyArray) && currentInstanceId < propertyArray.length) {
                // If property is not already defined in properties, add it
                if (properties[propertyName] === undefined) {
                    properties[propertyName] = propertyArray[currentInstanceId];
                }
            }
        });

        // Process inherited properties (via parentId)
        this.extractInheritedProperties(
            hierarchyExtension,
            currentClassId,
            currentInstanceId,
            properties
        );
    }

    /**
     * Extracts inherited properties from hierarchy
     * @param hierarchy - Hierarchy extension data
     * @param classId - Current class identifier
     * @param instanceId - Current instance identifier
     * @param properties - Properties object to populate
     */
    private extractInheritedProperties(
        hierarchy: HierarchyExtension,
        classId: number,
        instanceId: number,
        properties: Record<string, any>
    ): void {
        const { classes } = hierarchy;
        let currentClassId = classId;
        let currentInstanceId = instanceId;

        // Traverse inheritance chain
        while (currentClassId < classes.length) {
            const classInfo = classes[currentClassId];
            const classInstances = classInfo.instances;

            // Check if parentId property exists
            const parentIds = classInstances.parentId;
            if (!parentIds || !Array.isArray(parentIds) || currentInstanceId >= parentIds.length) {
                break;
            }

            const parentId = parentIds[currentInstanceId];

            // If parentId equals currentInstanceId, no parent exists
            if (parentId === currentInstanceId) {
                break;
            }

            // Find parent class and instance
            // In HIERARCHY, parentId points to parent instance index in parent class

            // Traverse all classes to find parent
            let foundParent = false;
            for (let parentClassId = 0; parentClassId < classes.length; parentClassId++) {
                const parentClass = classes[parentClassId];
                const parentClassInstances = parentClass.instances;

                // Check if parent class has enough instances
                const firstProperty = Object.values(parentClassInstances)[0];
                if (Array.isArray(firstProperty) && parentId < firstProperty.length) {
                    // Add parent class properties to properties object (only if not already defined)
                    Object.keys(parentClassInstances).forEach(propertyName => {
                        // Skip special properties
                        if (propertyName === "parentId") {
                            return;
                        }

                        const propertyArray = parentClassInstances[propertyName];
                        if (Array.isArray(propertyArray) && parentId < propertyArray.length) {
                            // If property is not already defined in properties, add it
                            if (properties[propertyName] === undefined) {
                                properties[propertyName] = propertyArray[parentId];
                            }
                        }
                    });

                    // Update current class and instance ID to continue traversing inheritance chain
                    currentClassId = parentClassId;
                    currentInstanceId = parentId;
                    foundParent = true;
                    break;
                }
            }

            // If no parent found, exit loop
            if (!foundParent) {
                break;
            }
        }
    }

    /**
     * Applies materials to object
     * @param object - 3D object to apply materials to
     * @param material - Materials to apply
     */
    private applyMaterialToObject(object: THREE.Object3D, material: B3DMBatchMaterial[]): void {
        object.traverse((child: THREE.Object3D) => {
            if (child.type === "Mesh") {
                const mesh = child as THREE.Mesh;
                // Save original material for restoration
                if (!mesh.userData.originalMaterial) {
                    mesh.userData.originalMaterial = mesh.material;
                }
                mesh.material = material as any;
            }
        });
    }

    /**
     * Applies materials to specific cached geometry
     * @param tile - Tile instance
     * @param material - Materials to apply
     */
    private applyMaterialToCachedGeometry(tile: ITile, material: B3DMBatchMaterial[]): void {
        // If tile has cached geometry and materials, directly replace materials array
        if (tile.cached?.geometry && tile.cached?.materials) {
            // Save original materials for restoration
            if (!(tile.cached as any).originalMaterials) {
                (tile.cached as any).originalMaterials = [...tile.cached.materials];
            }

            // Replace all materials with new batch materials
            for (let i = 0; i < tile.cached.materials.length; i++) {
                tile.cached.materials[i] = material as any;
            }

            // Also update corresponding mesh objects in scene
            tile.cached.scene.traverse((child: THREE.Object3D) => {
                if (child.type === "Mesh") {
                    const mesh = child as THREE.Mesh;
                    // Save original material for restoration
                    if (!mesh.userData.originalMaterial) {
                        mesh.userData.originalMaterial = mesh.material;
                    }

                    let meshMaterials: THREE.Material[] = [];
                    if (mesh.material instanceof Array) meshMaterials = mesh.material;
                    else meshMaterials.push(mesh.material);

                    if (mesh.material instanceof Array) {
                        mesh.material = meshMaterials.map(mat =>
                            material.find(mat2 => mat2.userData.originUUID == mat.uuid)
                        );
                    } else if (mesh.material instanceof THREE.Material) {
                        mesh.material = material.find(
                            mat => mat.userData.originUUID == (mesh.material as THREE.Material).uuid
                        );
                    }
                }
            });
        } else {
            // Fallback to original traversal method
            this.applyMaterialToObject(tile.cached.scene, material);
        }
    }

    /**
     * Gets tile identifier
     * @param tile - Tile instance
     * @returns Tile identifier string
     */
    private getTileId(tile: ITile): string {
        return tile.__basePath + tile.content?.uri || (tile as any).uuid || "unknown";
    }

    /**
     * Checks if feature is B3DM format
     * @param feature - Tile feature to check
     * @returns True if feature is B3DM format
     */
    private isB3DMFeature(feature: B3DMTileFeature | I3DMTileFeature): feature is B3DMTileFeature {
        return "batchTable" in feature && "batchLength" in feature && "object3D" in feature;
    }

    /**
     * Checks if feature is I3DM format
     * @param feature - Tile feature to check
     * @returns True if feature is I3DM format
     */
    private isI3DMFeature(feature: B3DMTileFeature | I3DMTileFeature): feature is I3DMTileFeature {
        return "instanceCount" in feature && "instancedObjects" in feature;
    }

    // ==================== Data Retrieval Helper Methods ====================

    /**
     * Gets batch table data
     * @param tile - Tile instance
     * @returns Batch table data or null if not found
     */
    private getBatchTableData(tile: any): BatchTableData | null {
        // Try different batch table access paths
        if (tile.cached?.scene?.batchTable) {
            return tile.cached.scene.batchTable;
        }

        if (tile.content?.batchTable) {
            return tile.content.batchTable;
        }

        if (tile.batchTable) {
            return tile.batchTable;
        }

        return null;
    }

    /**
     * Gets feature table data (mainly for I3DM)
     * @param tile - Tile instance
     * @returns Feature table data or null if not found
     */
    private getFeatureTableData(tile: any): Record<string, any> | null {
        if (tile.cached?.scene?.featureTable) {
            return tile.cached.scene.featureTable;
        }

        if (tile.content?.featureTable) {
            return tile.content.featureTable;
        }

        if (tile.featureTable) {
            return tile.featureTable;
        }

        return null;
    }

    /**
     * Gets batch length
     * @param tile - Tile instance
     * @returns Batch length
     */
    private getBatchLength(tile: any): number {
        // Try to get batch length from different locations
        if (tile.cached?.scene?.batchLength !== undefined) {
            return tile.cached.scene.batchLength;
        }

        if (tile.content?.batchLength !== undefined) {
            return tile.content.batchLength;
        }

        // Infer length from batch table
        const batchTable = this.getBatchTableData(tile);
        if (batchTable) {
            const firstProperty = Object.values(batchTable)[0];
            if (Array.isArray(firstProperty)) {
                return firstProperty.length;
            }
        }

        return 0;
    }

    /**
     * Gets instances length (for I3DM)
     * @param tile - Tile instance
     * @returns Instances length
     */
    private getInstancesLength(tile: any): number {
        if (tile.cached?.scene?.instancesLength !== undefined) {
            return tile.cached.scene.instancesLength;
        }

        if (tile.content?.instancesLength !== undefined) {
            return tile.content.instancesLength;
        }

        const featureTable = this.getFeatureTableData(tile);
        if (featureTable && featureTable.json.INSTANCES_LENGTH !== undefined) {
            return featureTable.json.INSTANCES_LENGTH;
        }

        return 0;
    }

    /**
     * Restores original materials
     * @param tileId - Tile identifier
     * @param tile - Tile instance
     */
    private restoreOriginalMaterials(tileId: string, tile: ITile): void {
        // Restore materials from cache
        if (tile.cached && (tile.cached as any).originalMaterials) {
            const originalMaterials = (tile.cached as any).originalMaterials;
            // Restore materials array in cache
            for (let i = 0; i < originalMaterials.length && i < tile.cached.materials.length; i++) {
                tile.cached.materials[i] = originalMaterials[i];
            }
            // Clean up cached original materials reference
            delete (tile.cached as any).originalMaterials;
        }

        // Restore original materials for meshes in scene
        if (tile.cached?.scene) {
            tile.cached.scene.traverse((child: THREE.Object3D) => {
                if (child.type === "Mesh") {
                    const mesh = child as THREE.Mesh;
                    // If original material was saved, restore it
                    if (mesh.userData.originalMaterial) {
                        mesh.material = mesh.userData.originalMaterial;
                        // Clean up saved original material reference
                        delete mesh.userData.originalMaterial;
                    }
                }
            });
        }
    }

    /**
     * Disposes all resources and cleans up
     */
    public dispose(): void {
        // Traverse all tiles with applied materials and restore their original materials
        this.m_tileFeatures.forEach((feature, tileId) => {
            // Get corresponding tile object (if exists)
            let scene: THREE.Object3D | undefined;

            // Get scene object based on feature type
            if (this.isB3DMFeature(feature)) {
                scene = feature.object3D;
            } else if (this.isI3DMFeature(feature) && feature.instancedObjects.length > 0) {
                scene = feature.instancedObjects[0];
            }

            // If scene object exists, create a mock tile object for material restoration
            if (scene) {
                const mockTile: ITile = {
                    __basePath: "",
                    content: { uri: tileId.split("/").pop() || "" },
                    cached: {
                        scene
                    }
                } as any;

                // Restore materials
                this.restoreOriginalMaterials(tileId, mockTile);
            }
        });

        // Clean up all material resources
        this.m_appliedMaterials.forEach((materials, tileId) => {
            materials.forEach(mat => {
                mat.dispose();
            });
        });

        // Clear all collections
        this.m_appliedMaterials.clear();
        this.m_tileFeatures.clear();

        this.m_mapRenderingManager.removeTranslucentLayer(this.observeId);

        // Call parent class dispose method
        super.dispose();
    }
}