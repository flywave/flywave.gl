/* Copyright (C) 2025 flywave.gl contributors */

// GLTF EXTENSION: EXT_bim4d_metadata (Node Level)
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF, GLTFNode } from "../types/gltf-json-schema";

const EXTENSION_NAME = "FLYWAVE_bim4d_metadata";
export const name = EXTENSION_NAME;

// 状态枚举定义
export enum WorkStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed"
}

// 生成类型枚举
export enum GenerateType {
    AUTO = "auto",
    MANUAL = "manual"
}

// 进度类型枚举
export enum ProgressType {
    PERCENTAGE = "percentage",
    ABSOLUTE = "absolute"
}

// 核心数据结构
export interface WorkItem {
    id: string;
    name: string;
    description?: string;
    status: WorkStatus;
    generateType: GenerateType;
    workType: "schedule" | "plan";
    startTime: string; // ISO 8601格式
    endTime: string; // ISO 8601格式
    scheduleStart?: string;
    scheduleEnd?: string;
    startValue: number;
    endValue: number;
    progressType: ProgressType;
    total: number;
    metadata?: Record<string, any>; // 可选元数据
}

// 节点扩展数据结构
interface NodeBIM4dMetadata {
    works?: WorkItem[];
    currentWorkId?: string;
    version: string;
}

// 解码实现（节点级）
export async function decode(gltfData: { json: GLTF }, options: any = {}): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);
    const { logger = console } = options;
    const { nodes = [] } = gltfData.json;

    // 遍历所有节点
    for (const node of nodes) {
        const extension = scenegraph.getObjectExtension<NodeBIM4dMetadata>(node, EXTENSION_NAME);
        if (!extension) continue;

        const { works = [] } = extension;

        // 从二进制数据解码metadata
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

                    // 删除临时字段
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

        // 将扩展数据保存到节点userData
        node.userData = node.userData || {};
        node.userData.bim4dMetadata = extension;
    }
}

// 编码实现（节点级）
export function encode(gltfData: { json: GLTF }, options: any = {}) {
    const scenegraph = new GLTFScenegraph(gltfData);
    const { logger = console } = options;
    const { nodes = [] } = gltfData.json;

    let hasExtension = false;

    // 遍历所有节点
    for (const node of nodes) {
        // 从userData获取扩展数据
        const metadata = node.userData?.bim4dMetadata;
        if (!metadata) continue;

        hasExtension = true;

        // 创建节点扩展数据的深拷贝
        const extensionClone: NodeBIM4dMetadata = {
            ...metadata,
            works: metadata.works ? metadata.works.map(work => ({ ...work })) : []
        };

        // 处理元数据编码
        if (extensionClone.works) {
            for (const work of extensionClone.works) {
                // 跳过空元数据
                if (!work.metadata || Object.keys(work.metadata).length === 0) {
                    delete work.metadata;
                    continue;
                }

                try {
                    // 序列化元数据
                    const jsonString = JSON.stringify(work.metadata);
                    const binaryData = new TextEncoder().encode(jsonString);

                    // 添加到GLTF并获取缓冲视图索引
                    const bufferViewIndex = scenegraph.addBufferView(binaryData);

                    // 存储缓冲视图引用并删除原始元数据
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

        // 添加节点扩展
        scenegraph.addObjectExtension(node, EXTENSION_NAME, extensionClone);
    }

    // 如果需要，添加顶级扩展声明
    if (hasExtension) {
        scenegraph.addRequiredExtension(EXTENSION_NAME);
    }

    return scenegraph.gltf;
}

// 验证工作项的有效性
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

// 属性转换方法（带验证）
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

// 节点扩展操作API
export class BIM4dNodeExtension {
    /**
     * 为节点添加工作项
     * @param node 目标节点
     * @param workItem 工作项数据
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
     * 获取节点的工作项
     * @param node 目标节点
     * @returns 工作项数组
     */
    static getWorkItems(node: GLTFNode): WorkItem[] {
        return node.userData?.bim4dMetadata?.works || [];
    }

    /**
     * 设置节点的当前工作项
     * @param node 目标节点
     * @param workId 工作项ID
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
     * 获取节点的当前工作项
     * @param node 目标节点
     * @returns 当前工作项或null
     */
    static getCurrentWorkItem(node: GLTFNode): WorkItem | null {
        const metadata = node.userData?.bim4dMetadata;
        if (!metadata) return null;

        const currentId = metadata.currentWorkId;
        if (!currentId) return null;

        return metadata.works?.find(work => work.id === currentId) || null;
    }

    /**
     * 更新工作项进度
     * @param node 目标节点
     * @param workId 工作项ID
     * @param progress 新进度值
     */
    static updateWorkProgress(node: GLTFNode, workId: string, progress: number) {
        const workItem = BIM4dNodeExtension.getWorkItemById(node, workId);
        if (workItem) {
            workItem.startValue = progress;
        }
    }

    /**
     * 按ID获取工作项
     * @param node 目标节点
     * @param workId 工作项ID
     * @returns 工作项或null
     */
    static getWorkItemById(node: GLTFNode, workId: string): WorkItem | null {
        const works = BIM4dNodeExtension.getWorkItems(node);
        return works.find(work => work.id === workId) || null;
    }

    /**
     * 计算工作项进度百分比
     * @param work 工作项
     * @returns 进度百分比
     */
    static calculateWorkProgress(work: WorkItem): number {
        if (work.progressType === ProgressType.PERCENTAGE) {
            return work.startValue;
        }

        if (work.total === 0) return 0;
        return (work.startValue / work.total) * 100;
    }
}
