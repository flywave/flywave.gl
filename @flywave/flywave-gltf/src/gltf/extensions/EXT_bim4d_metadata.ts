// GLTF EXTENSION: EXT_bim4d_metadata
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF } from "../types/gltf-json-schema";

const EXT_bim4d_METADATA_NAME = "EXT_bim4d_metadata";
export const name = EXT_bim4d_METADATA_NAME;

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
    startTime: string;
    endTime: string;
    scheduleStart?: string;
    scheduleEnd?: string;
    startValue: number;
    endValue: number;
    progressType: ProgressType;
    total: number;
    metadata: Record<string, any>;
}

// 扩展数据结构
interface EXT_bim4d_metadata {
    works?: WorkItem[];
    currentWorkId?: string;
    version: string;
}

// 解码实现
export async function decode(gltfData: { json: GLTF }, options: any): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);
    const extension = scenegraph.getExtension<EXT_bim4d_metadata>(EXT_bim4d_METADATA_NAME);

    if (!extension) return;

    // 从二进制数据解码
    if (extension.works) {
        for (const work of extension.works) {
            // 检查是否存在二进制引用
            if ((work as any).metadataBufferView !== undefined) {
                const bufferViewIndex = (work as any).metadataBufferView;
                try {
                    // 获取二进制数据
                    const data = scenegraph.getTypedArrayForBufferView(bufferViewIndex);
                    // 将二进制数据解码为字符串
                    const decoder = new TextDecoder();
                    const jsonString = decoder.decode(data);
                    // 解析JSON字符串
                    work.metadata = JSON.parse(jsonString);
                    // 删除临时引用字段
                    delete (work as any).metadataBufferView;
                } catch (error) {
                    work.metadata = {};
                }
            }
        }
    }
}

// 编码实现
export function encode(gltfData: { json: GLTF }, options: any) {
    const scenegraph = new GLTFScenegraph(gltfData);
    const extension = scenegraph.getExtension<EXT_bim4d_metadata>(EXT_bim4d_METADATA_NAME);

    if (!extension) return;

    // 将数据编码到二进制
    if (extension.works) {
        for (const work of extension.works) {
            if (work.metadata && Object.keys(work.metadata).length > 0) {
                try {
                    // 序列化metadata为JSON字符串
                    const jsonString = JSON.stringify(work.metadata);
                    // 转换为二进制
                    const encoder = new TextEncoder();
                    const binaryData = encoder.encode(jsonString);
                    // 添加到GLTF二进制缓冲区
                    const bufferViewIndex = scenegraph.addBufferView(binaryData);
                    // 添加临时引用字段
                    (work as any).metadataBufferView = bufferViewIndex;
                    // 移除原始metadata字段（稍后会恢复）
                    delete work.metadata;
                } catch (error) {
                    delete work.metadata;
                }
            }
        }
    }

    // 创建二进制块并恢复metadata字段
    scenegraph.createBinaryChunk();
    if (extension.works) {
        for (const work of extension.works) {
            if ((work as any).metadataBufferView !== undefined) {
                // 恢复metadata字段
                work.metadata = JSON.parse(
                    new TextDecoder().decode(
                        scenegraph.getTypedArrayForBufferView((work as any).metadataBufferView)
                    )
                );
                // 清理临时字段
                delete (work as any).metadataBufferView;
            }
        }
    }
    return scenegraph.gltf;
}

// 属性转换方法
export function createWorkItem(info: any): WorkItem {
    return {
        id: info.id,
        name: info.name,
        description: info.description || "",
        status: info.status as WorkStatus,
        generateType: info.generateType as GenerateType,
        workType: info.workType,
        startTime: info.startTime,
        endTime: info.endTime,
        scheduleStart: info.scheduleStart,
        scheduleEnd: info.scheduleEnd,
        startValue: info.startValue,
        endValue: info.endValue,
        progressType: info.progressType as ProgressType,
        total: info.total,
        metadata: info.metadata || {}
    };
}
