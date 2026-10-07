/* Copyright (C) 2025 flywave.gl contributors */

// GLTF EXTENSION: EXT_bim4d_metadata (Node Level)
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF, GLTFNode } from "../types/gltf-json-schema";

const EXTENSION_NAME = "FLYWAVE_bim4d_metadata";
export const name = EXTENSION_NAME;

// Status enum definition
export enum WorkStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed"
}

// Generation type enum
export enum GenerateType {
    AUTO = "auto",
    MANUAL = "manual"
}

// Progress type enum
export enum ProgressType {
    PERCENTAGE = "percentage",
    ABSOLUTE = "absolute"
}

// Core data structure
export interface WorkItem {
    id: string;
    name: string;
    description?: string;
    status: WorkStatus;
    generateType: GenerateType;
    workType: "schedule" | "plan";
    startTime: string; // ISO 8601 format
    endTime: string; // ISO 8601 format
    scheduleStart?: string;
    scheduleEnd?: string;
    startValue: number;
    endValue: number;
    progressType: ProgressType;
    total: number;
    metadata?: Record<string, any>; // Optional metadata
}

// Node extension data structure
interface NodeBIM4dMetadata {
    works?: WorkItem[];
    currentWorkId?: string;
    version: string;
}

// Decode implementation (node level)
export async function decode(gltfData: { json: GLTF }, options: any = {}): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);
    const { logger = console } = options;
    const { nodes = [] } = gltfData.json;

    // Iterate over all nodes
    for (const node of nodes) {
        const extension = scenegraph.getObjectExtension<NodeBIM4dMetadata>(node, EXTENSION_NAME);
        if (!extension) continue;

        const { works = [] } = extension;

        // Decode the metadata from the binary data
        for (const work of works) {
            try {
                const bufferViewIndex = (work as any).metadataBufferView;
                if (typeof bufferViewIndex === "number") {
                    const data = scenegraph.getTypedArrayForBufferView(bufferViewIndex);

                    if (!data) {
                        logger.warn(
                            `节点 ${
                                node.name || node.mesh
                            } 无法获取缓冲视图 ${bufferViewIndex} 的数据`
                        );
                        continue;
                    }

                    try {
                        const jsonString = new TextDecoder().decode(data);
                        work.metadata = JSON.parse(jsonString);
                    } catch (parseError) {
                        logger.error(
                            `节点 ${node.name || node.mesh} 解析元数据失败: ${parseError.message}`
                        );
                    }

                    // Delete the temporary field
                    delete (work as any).metadataBufferView;
                }
            } catch (error) {
                logger.error(
                    `节点 ${node.name || node.mesh} 处理工作项 ${work.id} 元数据失败: ${
                        error.message
                    }`
                );
            }
        }

        // Store the extension data on the node's userData
        node.userData = node.userData || {};
        node.userData.bim4dMetadata = extension;
    }
}

// Encode implementation (node level)
export function encode(gltfData: { json: GLTF }, options: any = {}) {
    const scenegraph = new GLTFScenegraph(gltfData);
    const { logger = console } = options;
    const { nodes = [] } = gltfData.json;

    let hasExtension = false;

    // Iterate over all nodes
    for (const node of nodes) {
        // Get the extension data from userData
        const metadata = node.userData?.bim4dMetadata;
        if (!metadata) continue;

        hasExtension = true;

        // Deep copy the node extension data
        const extensionClone: NodeBIM4dMetadata = {
            ...metadata,
            works: metadata.works ? metadata.works.map(work => ({ ...work })) : []
        };

        // Handle metadata encoding
        if (extensionClone.works) {
            for (const work of extensionClone.works) {
                // Skip empty metadata
                if (!work.metadata || Object.keys(work.metadata).length === 0) {
                    delete work.metadata;
                    continue;
                }

                try {
                    // Serialize the metadata
                    const jsonString = JSON.stringify(work.metadata);
                    const binaryData = new TextEncoder().encode(jsonString);

                    // Add it to the glTF and get the buffer view index
                    const bufferViewIndex = scenegraph.addBufferView(binaryData);

                    // Store the buffer view reference and drop the original metadata
                    (work as any).metadataBufferView = bufferViewIndex;
                    delete work.metadata;
                } catch (error) {
                    logger.error(
                        `节点 ${node.name || node.mesh} 序列化工作项 ${work.id} 元数据失败: ${
                            error.message
                        }`
                    );
                    delete work.metadata;
                }
            }
        }

        // Add the node extension
        scenegraph.addObjectExtension(node, EXTENSION_NAME, extensionClone);
    }

    // Add the top-level extension declaration when needed
    if (hasExtension) {
        scenegraph.addRequiredExtension(EXTENSION_NAME);
    }

    return scenegraph.gltf;
}

// Validate a work item
export function validateWorkItem(work: Partial<WorkItem>): work is WorkItem {
    return (
        typeof work.id === "string" &&
        typeof work.name === "string" &&
        Object.values(WorkStatus).includes(work.status as WorkStatus) &&
        Object.values(GenerateType).includes(work.generateType as GenerateType) &&
        ["schedule", "plan"].includes(work.workType as any) &&
        typeof work.startTime === "string" &&
        typeof work.endTime === "string" &&
        typeof work.startValue === "number" &&
        typeof work.endValue === "number" &&
        Object.values(ProgressType).includes(work.progressType as ProgressType) &&
        typeof work.total === "number"
    );
}

// Property conversion helper (with validation)
export function createWorkItem(info: any): WorkItem | null {
    const workItem: Partial<WorkItem> = {
        id: info.id,
        name: info.name,
        description: info.description,
        status: info.status,
        generateType: info.generateType,
        workType: info.workType,
        startTime: info.startTime,
        endTime: info.endTime,
        scheduleStart: info.scheduleStart,
        scheduleEnd: info.scheduleEnd,
        startValue: info.startValue,
        endValue: info.endValue,
        progressType: info.progressType,
        total: info.total,
        metadata: info.metadata
    };

    return validateWorkItem(workItem) ? (workItem as WorkItem) : null;
}

// Node extension operation API
export class BIM4dNodeExtension {
    /**
     * Add a work item to a node
     * @param node the target node
     * @param workItem the work item data
     */
    static addWorkItem(node: GLTFNode, workItem: WorkItem) {
        node.userData = node.userData || {};
        node.userData.bim4dMetadata = node.userData.bim4dMetadata || {
            version: "1.0",
            works: []
        };

        const metadata = node.userData.bim4dMetadata;
        metadata.works = metadata.works || [];
        metadata.works.push(workItem);
    }

    /**
     * Get the work items of a node
     * @param node the target node
     * @returns the array of work items
     */
    static getWorkItems(node: GLTFNode): WorkItem[] {
        return node.userData?.bim4dMetadata?.works || [];
    }

    /**
     * Set the current work item of a node
     * @param node the target node
     * @param workId the work item ID
     */
    static setCurrentWorkItem(node: GLTFNode, workId: string) {
        node.userData = node.userData || {};
        node.userData.bim4dMetadata = node.userData.bim4dMetadata || {
            version: "1.0",
            works: []
        };

        node.userData.bim4dMetadata.currentWorkId = workId;
    }

    /**
     * Get the current work item of a node
     * @param node the target node
     * @returns the current work item or null
     */
    static getCurrentWorkItem(node: GLTFNode): WorkItem | null {
        const metadata = node.userData?.bim4dMetadata;
        if (!metadata) return null;

        const currentId = metadata.currentWorkId;
        if (!currentId) return null;

        return metadata.works?.find(work => work.id === currentId) || null;
    }

    /**
     * Update the progress of a work item
     * @param node the target node
     * @param workId the work item ID
     * @param progress the new progress value
     */
    static updateWorkProgress(node: GLTFNode, workId: string, progress: number) {
        const workItem = BIM4dNodeExtension.getWorkItemById(node, workId);
        if (workItem) {
            workItem.startValue = progress;
        }
    }

    /**
     * Get a work item by ID
     * @param node the target node
     * @param workId the work item ID
     * @returns the work item or null
     */
    static getWorkItemById(node: GLTFNode, workId: string): WorkItem | null {
        const works = BIM4dNodeExtension.getWorkItems(node);
        return works.find(work => work.id === workId) || null;
    }

    /**
     * Compute the progress percentage of a work item
     * @param work the work item
     * @returns the progress percentage
     */
    static calculateWorkProgress(work: WorkItem): number {
        if (work.progressType === ProgressType.PERCENTAGE) {
            return work.startValue;
        }

        if (work.total === 0) return 0;
        return (work.startValue / work.total) * 100;
    }
}
