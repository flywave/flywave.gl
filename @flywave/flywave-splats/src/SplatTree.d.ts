import * as THREE from "three";
export interface SplatTreeNodeData {
    indexes?: number[];
}
export declare class SplatTreeNode {
    static idGen: number;
    min: THREE.Vector3;
    max: THREE.Vector3;
    boundingBox: THREE.Box3;
    center: THREE.Vector3;
    depth: number;
    children: SplatTreeNode[];
    data: SplatTreeNodeData | null;
    id: number;
    constructor(min: THREE.Vector3, max: THREE.Vector3, depth: number, id?: number);
}
export interface SplatSubTreeData {
    indexes: number[];
}
export declare class SplatSubTree {
    maxDepth: number;
    maxCentersPerNode: number;
    sceneDimensions: THREE.Vector3;
    sceneMin: THREE.Vector3;
    sceneMax: THREE.Vector3;
    rootNode: SplatTreeNode | null;
    nodesWithIndexes: SplatTreeNode[];
    splatMesh: any;
    constructor(maxDepth: number, maxCentersPerNode: number);
    static convertWorkerSubTreeNode(workerSubTreeNode: any): SplatTreeNode;
    static convertWorkerSubTree(workerSubTree: any, splatMesh: any): SplatSubTree;
}
export interface WorkerBox3 {
    min: [number, number, number];
    max: [number, number, number];
    containsPoint(point: [number, number, number]): boolean;
}
export interface WorkerSplatSubTree {
    maxDepth: number;
    maxCentersPerNode: number;
    sceneDimensions: number[];
    sceneMin: number[];
    sceneMax: number[];
    rootNode: any;
    addedIndexes: Record<number, boolean>;
    nodesWithIndexes: any[];
    splatMesh: any;
    disposed: boolean;
}
export interface WorkerSplatTreeNode {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    depth: number;
    children: WorkerSplatTreeNode[];
    data: any;
    id: number;
}
export declare class SplatTree {
    maxDepth: number;
    maxCentersPerNode: number;
    subTrees: SplatSubTree[];
    splatMesh: any;
    splatTreeWorker: Worker | null;
    disposed: boolean;
    constructor(maxDepth: number, maxCentersPerNode: number);
    dispose(): void;
    diposeSplatTreeWorker(): void;
    processSplatMesh(splatMesh: any, // Replace with proper type
    filterFunc?: (index: number) => boolean, onIndexesUpload?: (started: boolean) => void, onSplatTreeConstruction?: (started: boolean) => void): Promise<void>;
    countLeaves(): number;
    visitLeaves(visitFunc: (node: SplatTreeNode) => void): void;
}
