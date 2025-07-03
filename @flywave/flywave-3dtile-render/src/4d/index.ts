export enum WorkStatus {
    WorkStatusNotStarted = "NOT_STAETED",
    WorkStatusInProgress = "IN_PROGRESS",
    WorkStatusCompleted = "COMPLETED"
}

export enum GenerateType {
    GenerateTypeAssemble = "ASSEMBLE",
    GenerateTypeBuild = "BUILD"
}

export enum ProgressType {
    ProgressByRatio = "RATIO",
    ProgressByDistance = "DISTANCE"
}

export interface Topo4DWorkInfo {
    id: string;
    name: string;
    description: string;
    status: WorkStatus;
    generateType: GenerateType;
    workType: string;
    startTime: string;
    endTime: string;
    scheduleStart: string;
    scheduleEnd: string;
    startValue: number;
    endValue: number;
    progressType: ProgressType;
    total: number;
    metadata: Record<string, any>;
}
