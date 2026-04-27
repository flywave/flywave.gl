import type { GLTF, GLTFNode } from "../types/gltf-json-schema";
export declare const name = "FLYWAVE_bim4d_metadata";
export declare enum WorkStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed"
}
export declare enum GenerateType {
    AUTO = "auto",
    MANUAL = "manual"
}
export declare enum ProgressType {
    PERCENTAGE = "percentage",
    ABSOLUTE = "absolute"
}
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
    metadata?: Record<string, any>;
}
export declare function decode(gltfData: {
    json: GLTF;
}, options?: any): Promise<void>;
export declare function encode(gltfData: {
    json: GLTF;
}, options?: any): import("../..").GLTFWithBuffers;
export declare function validateWorkItem(work: Partial<WorkItem>): work is WorkItem;
export declare function createWorkItem(info: any): WorkItem | null;
export declare class BIM4dNodeExtension {
    /**
     * 为节点添加工作项
     * @param node 目标节点
     * @param workItem 工作项数据
     */
    static addWorkItem(node: GLTFNode, workItem: WorkItem): void;
    /**
     * 获取节点的工作项
     * @param node 目标节点
     * @returns 工作项数组
     */
    static getWorkItems(node: GLTFNode): WorkItem[];
    /**
     * 设置节点的当前工作项
     * @param node 目标节点
     * @param workId 工作项ID
     */
    static setCurrentWorkItem(node: GLTFNode, workId: string): void;
    /**
     * 获取节点的当前工作项
     * @param node 目标节点
     * @returns 当前工作项或null
     */
    static getCurrentWorkItem(node: GLTFNode): WorkItem | null;
    /**
     * 更新工作项进度
     * @param node 目标节点
     * @param workId 工作项ID
     * @param progress 新进度值
     */
    static updateWorkProgress(node: GLTFNode, workId: string, progress: number): void;
    /**
     * 按ID获取工作项
     * @param node 目标节点
     * @param workId 工作项ID
     * @returns 工作项或null
     */
    static getWorkItemById(node: GLTFNode, workId: string): WorkItem | null;
    /**
     * 计算工作项进度百分比
     * @param work 工作项
     * @returns 进度百分比
     */
    static calculateWorkProgress(work: WorkItem): number;
}
