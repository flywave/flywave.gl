/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { delayedExecute } from "./Util";

export interface SplatTreeNodeData {
    indexes?: number[];
}

export class SplatTreeNode {
    static idGen = 0;
    min: THREE.Vector3;
    max: THREE.Vector3;
    boundingBox: THREE.Box3;
    center: THREE.Vector3;
    depth: number;
    children: SplatTreeNode[];
    data: SplatTreeNodeData | null;
    id: number;

    constructor(min: THREE.Vector3, max: THREE.Vector3, depth: number, id?: number) {
        this.min = new THREE.Vector3().copy(min);
        this.max = new THREE.Vector3().copy(max);
        this.boundingBox = new THREE.Box3(this.min, this.max);
        this.center = new THREE.Vector3()
            .copy(this.max)
            .sub(this.min)
            .multiplyScalar(0.5)
            .add(this.min);
        this.depth = depth;
        this.children = [];
        this.data = null;
        this.id = id || SplatTreeNode.idGen++;
    }
}

export interface SplatSubTreeData {
    indexes: number[];
}

export class SplatSubTree {
    maxDepth: number;
    maxCentersPerNode: number;
    sceneDimensions: THREE.Vector3;
    sceneMin: THREE.Vector3;
    sceneMax: THREE.Vector3;
    rootNode: SplatTreeNode | null;
    nodesWithIndexes: SplatTreeNode[];
    splatMesh: any; // Replace 'any' with actual SplatMesh type if available

    constructor(maxDepth: number, maxCentersPerNode: number) {
        this.maxDepth = maxDepth;
        this.maxCentersPerNode = maxCentersPerNode;
        this.sceneDimensions = new THREE.Vector3();
        this.sceneMin = new THREE.Vector3();
        this.sceneMax = new THREE.Vector3();
        this.rootNode = null;
        this.nodesWithIndexes = [];
        this.splatMesh = null;
    }

    static convertWorkerSubTreeNode(workerSubTreeNode: any): SplatTreeNode {
        const minVector = new THREE.Vector3().fromArray(workerSubTreeNode.min);
        const maxVector = new THREE.Vector3().fromArray(workerSubTreeNode.max);
        const convertedNode = new SplatTreeNode(
            minVector,
            maxVector,
            workerSubTreeNode.depth,
            workerSubTreeNode.id
        );

        if (workerSubTreeNode.data?.indexes) {
            convertedNode.data = {
                indexes: [...workerSubTreeNode.data.indexes]
            };
        }

        if (workerSubTreeNode.children) {
            for (const child of workerSubTreeNode.children) {
                convertedNode.children.push(SplatSubTree.convertWorkerSubTreeNode(child));
            }
        }

        return convertedNode;
    }

    static convertWorkerSubTree(workerSubTree: any, splatMesh: any): SplatSubTree {
        const convertedSubTree = new SplatSubTree(
            workerSubTree.maxDepth,
            workerSubTree.maxCentersPerNode
        );
        convertedSubTree.sceneMin = new THREE.Vector3().fromArray(workerSubTree.sceneMin);
        convertedSubTree.sceneMax = new THREE.Vector3().fromArray(workerSubTree.sceneMax);
        convertedSubTree.splatMesh = splatMesh;
        convertedSubTree.rootNode = SplatSubTree.convertWorkerSubTreeNode(workerSubTree.rootNode);

        const visitLeavesFromNode = (
            node: SplatTreeNode,
            visitFunc: (node: SplatTreeNode) => void
        ) => {
            if (node.children.length === 0) visitFunc(node);
            for (const child of node.children) {
                visitLeavesFromNode(child, visitFunc);
            }
        };

        convertedSubTree.nodesWithIndexes = [];
        visitLeavesFromNode(convertedSubTree.rootNode, node => {
            if (node.data?.indexes && node.data.indexes.length > 0) {
                convertedSubTree.nodesWithIndexes.push(node);
            }
        });

        return convertedSubTree;
    }
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
    rootNode: any; // Replace with proper type
    addedIndexes: Record<number, boolean>;
    nodesWithIndexes: any[]; // Replace with proper type
    splatMesh: any; // Replace with proper type
    disposed: boolean;
}

export interface WorkerSplatTreeNode {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    depth: number;
    children: WorkerSplatTreeNode[];
    data: any; // Replace with proper type
    id: number;
}

function createSplatTreeWorker(self: Worker) {
    let WorkerSplatTreeNodeIDGen = 0;

    class WorkerBox3 implements WorkerBox3 {
        min: [number, number, number];
        max: [number, number, number];

        constructor(min: [number, number, number], max: [number, number, number]) {
            this.min = [...min];
            this.max = [...max];
        }

        containsPoint(point: [number, number, number]): boolean {
            return (
                point[0] >= this.min[0] &&
                point[0] <= this.max[0] &&
                point[1] >= this.min[1] &&
                point[1] <= this.max[1] &&
                point[2] >= this.min[2] &&
                point[2] <= this.max[2]
            );
        }
    }

    class WorkerSplatSubTree implements WorkerSplatSubTree {
        maxDepth: number;
        maxCentersPerNode: number;
        sceneDimensions: number[];
        sceneMin: [number, number, number];
        sceneMax: [number, number, number];
        rootNode: any;
        addedIndexes: Record<number, boolean>;
        nodesWithIndexes: any[];
        splatMesh: any;
        disposed: boolean;

        constructor(maxDepth: number, maxCentersPerNode: number) {
            this.maxDepth = maxDepth;
            this.maxCentersPerNode = maxCentersPerNode;
            this.sceneDimensions = [];
            this.sceneMin = [0, 0, 0];
            this.sceneMax = [0, 0, 0];
            this.rootNode = null;
            this.addedIndexes = {};
            this.nodesWithIndexes = [];
            this.splatMesh = null;
            this.disposed = false;
        }
    }

    class WorkerSplatTreeNode implements WorkerSplatTreeNode {
        min: [number, number, number];
        max: [number, number, number];
        center: [number, number, number];
        depth: number;
        children: WorkerSplatTreeNode[];
        data: any;
        id: number;

        constructor(
            min: [number, number, number],
            max: [number, number, number],
            depth: number,
            id?: number
        ) {
            this.min = [...min];
            this.max = [...max];
            this.center = [
                (max[0] - min[0]) * 0.5 + min[0],
                (max[1] - min[1]) * 0.5 + min[1],
                (max[2] - min[2]) * 0.5 + min[2]
            ];
            this.depth = depth;
            this.children = [];
            this.data = null;
            this.id = id || WorkerSplatTreeNodeIDGen++;
        }
    }

    const processSplatTreeNode = (
        tree: WorkerSplatSubTree,
        node: WorkerSplatTreeNode,
        indexToCenter: Record<number, number>,
        sceneCenters: Float32Array
    ) => {
        if (!node.data?.indexes) return;

        const splatCount = node.data.indexes.length;

        if (splatCount < tree.maxCentersPerNode || node.depth > tree.maxDepth) {
            const newIndexes: number[] = [];
            for (let i = 0; i < node.data.indexes.length; i++) {
                if (!tree.addedIndexes[node.data.indexes[i]]) {
                    newIndexes.push(node.data.indexes[i]);
                    tree.addedIndexes[node.data.indexes[i]] = true;
                }
            }
            node.data.indexes = newIndexes.sort((a, b) => a - b);
            tree.nodesWithIndexes.push(node);
            return;
        }

        const nodeDimensions = [
            node.max[0] - node.min[0],
            node.max[1] - node.min[1],
            node.max[2] - node.min[2]
        ];
        const halfDimensions = [
            nodeDimensions[0] * 0.5,
            nodeDimensions[1] * 0.5,
            nodeDimensions[2] * 0.5
        ];
        const nodeCenter = [
            node.min[0] + halfDimensions[0],
            node.min[1] + halfDimensions[1],
            node.min[2] + halfDimensions[2]
        ];

        const childrenBounds = [
            // top section, clockwise from upper-left (looking from above, +Y)
            new WorkerBox3(
                [
                    nodeCenter[0] - halfDimensions[0],
                    nodeCenter[1],
                    nodeCenter[2] - halfDimensions[2]
                ],
                [nodeCenter[0], nodeCenter[1] + halfDimensions[1], nodeCenter[2]]
            ),
            new WorkerBox3(
                [nodeCenter[0], nodeCenter[1], nodeCenter[2] - halfDimensions[2]],
                [
                    nodeCenter[0] + halfDimensions[0],
                    nodeCenter[1] + halfDimensions[1],
                    nodeCenter[2]
                ]
            ),
            new WorkerBox3(
                [nodeCenter[0], nodeCenter[1], nodeCenter[2]],
                [
                    nodeCenter[0] + halfDimensions[0],
                    nodeCenter[1] + halfDimensions[1],
                    nodeCenter[2] + halfDimensions[2]
                ]
            ),
            new WorkerBox3(
                [nodeCenter[0] - halfDimensions[0], nodeCenter[1], nodeCenter[2]],
                [
                    nodeCenter[0],
                    nodeCenter[1] + halfDimensions[1],
                    nodeCenter[2] + halfDimensions[2]
                ]
            ),

            // bottom section, clockwise from lower-left (looking from above, +Y)
            new WorkerBox3(
                [
                    nodeCenter[0] - halfDimensions[0],
                    nodeCenter[1] - halfDimensions[1],
                    nodeCenter[2] - halfDimensions[2]
                ],
                [nodeCenter[0], nodeCenter[1], nodeCenter[2]]
            ),
            new WorkerBox3(
                [
                    nodeCenter[0],
                    nodeCenter[1] - halfDimensions[1],
                    nodeCenter[2] - halfDimensions[2]
                ],
                [nodeCenter[0] + halfDimensions[0], nodeCenter[1], nodeCenter[2]]
            ),
            new WorkerBox3(
                [nodeCenter[0], nodeCenter[1] - halfDimensions[1], nodeCenter[2]],
                [
                    nodeCenter[0] + halfDimensions[0],
                    nodeCenter[1],
                    nodeCenter[2] + halfDimensions[2]
                ]
            ),
            new WorkerBox3(
                [
                    nodeCenter[0] - halfDimensions[0],
                    nodeCenter[1] - halfDimensions[1],
                    nodeCenter[2]
                ],
                [nodeCenter[0], nodeCenter[1], nodeCenter[2] + halfDimensions[2]]
            )
        ];

        const splatCounts: number[] = [];
        const baseIndexes: number[][] = [];
        for (let i = 0; i < childrenBounds.length; i++) {
            splatCounts[i] = 0;
            baseIndexes[i] = [];
        }

        const center: [number, number, number] = [0, 0, 0];
        for (let i = 0; i < splatCount; i++) {
            const splatGlobalIndex = node.data.indexes[i];
            const centerBase = indexToCenter[splatGlobalIndex];
            center[0] = sceneCenters[centerBase];
            center[1] = sceneCenters[centerBase + 1];
            center[2] = sceneCenters[centerBase + 2];

            for (let j = 0; j < childrenBounds.length; j++) {
                if (childrenBounds[j].containsPoint(center)) {
                    splatCounts[j]++;
                    baseIndexes[j].push(splatGlobalIndex);
                }
            }
        }

        for (let i = 0; i < childrenBounds.length; i++) {
            const childNode = new WorkerSplatTreeNode(
                childrenBounds[i].min,
                childrenBounds[i].max,
                node.depth + 1
            );
            childNode.data = {
                indexes: baseIndexes[i]
            };
            node.children.push(childNode);
        }

        node.data = {};
        for (const child of node.children) {
            processSplatTreeNode(tree, child, indexToCenter, sceneCenters);
        }
    };

    const buildSubTree = (
        sceneCenters: Float32Array,
        maxDepth: number,
        maxCentersPerNode: number
    ): WorkerSplatSubTree => {
        const sceneMin: [number, number, number] = [0, 0, 0];
        const sceneMax: [number, number, number] = [0, 0, 0];
        const indexes: number[] = [];
        const centerCount = Math.floor(sceneCenters.length / 4);

        for (let i = 0; i < centerCount; i++) {
            const base = i * 4;
            const x = sceneCenters[base];
            const y = sceneCenters[base + 1];
            const z = sceneCenters[base + 2];
            const index = Math.round(sceneCenters[base + 3]);

            if (i === 0 || x < sceneMin[0]) sceneMin[0] = x;
            if (i === 0 || x > sceneMax[0]) sceneMax[0] = x;
            if (i === 0 || y < sceneMin[1]) sceneMin[1] = y;
            if (i === 0 || y > sceneMax[1]) sceneMax[1] = y;
            if (i === 0 || z < sceneMin[2]) sceneMin[2] = z;
            if (i === 0 || z > sceneMax[2]) sceneMax[2] = z;

            indexes.push(index);
        }

        const subTree = new WorkerSplatSubTree(maxDepth, maxCentersPerNode);
        subTree.sceneMin = sceneMin;
        subTree.sceneMax = sceneMax;
        subTree.rootNode = new WorkerSplatTreeNode(subTree.sceneMin, subTree.sceneMax, 0);
        subTree.rootNode.data = {
            indexes
        };

        return subTree;
    };

    function createSplatTree(
        allCenters: Float32Array[],
        maxDepth: number,
        maxCentersPerNode: number
    ) {
        const indexToCenter: Record<number, number> = [];

        for (const sceneCenters of allCenters) {
            const centerCount = Math.floor(sceneCenters.length / 4);
            for (let i = 0; i < centerCount; i++) {
                const base = i * 4;
                const index = Math.round(sceneCenters[base + 3]);
                indexToCenter[index] = base;
            }
        }

        const subTrees: WorkerSplatSubTree[] = [];
        for (const sceneCenters of allCenters) {
            const subTree = buildSubTree(sceneCenters, maxDepth, maxCentersPerNode);
            subTrees.push(subTree);
            processSplatTreeNode(subTree, subTree.rootNode, indexToCenter, sceneCenters);
        }

        self.postMessage({
            subTrees
        });
    }

    self.onmessage = (e: MessageEvent) => {
        if (e.data.process) {
            createSplatTree(
                e.data.process.centers,
                e.data.process.maxDepth,
                e.data.process.maxCentersPerNode
            );
        }
    };
}

function workerProcessCenters(
    splatTreeWorker: Worker,
    centers: Float32Array[],
    transferBuffers: ArrayBuffer[],
    maxDepth: number,
    maxCentersPerNode: number
) {
    splatTreeWorker.postMessage(
        {
            process: {
                centers,
                maxDepth,
                maxCentersPerNode
            }
        },
        transferBuffers
    );
}

function checkAndCreateWorker(): Worker {
    return new Worker(
        URL.createObjectURL(
            new Blob(["(", createSplatTreeWorker.toString(), ")(self)"], {
                type: "application/javascript"
            })
        )
    );
}

export class SplatTree {
    maxDepth: number;
    maxCentersPerNode: number;
    subTrees: SplatSubTree[];
    splatMesh: any; // Replace with proper type
    splatTreeWorker: Worker | null;
    disposed: boolean;

    constructor(maxDepth: number, maxCentersPerNode: number) {
        this.maxDepth = maxDepth;
        this.maxCentersPerNode = maxCentersPerNode;
        this.subTrees = [];
        this.splatMesh = null;
        this.splatTreeWorker = null;
        this.disposed = false;
    }

    dispose() {
        this.diposeSplatTreeWorker();
        this.disposed = true;
    }

    diposeSplatTreeWorker() {
        if (this.splatTreeWorker) this.splatTreeWorker.terminate();
        this.splatTreeWorker = null;
    }

    processSplatMesh(
        splatMesh: any, // Replace with proper type
        filterFunc: (index: number) => boolean = () => true,
        onIndexesUpload?: (started: boolean) => void,
        onSplatTreeConstruction?: (started: boolean) => void
    ): Promise<void> {
        if (!this.splatTreeWorker) this.splatTreeWorker = checkAndCreateWorker();

        this.splatMesh = splatMesh;
        this.subTrees = [];
        const center = new THREE.Vector3();

        const addCentersForScene = (splatOffset: number, splatCount: number): Float32Array => {
            const sceneCenters = new Float32Array(splatCount * 4);
            let addedCount = 0;

            for (let i = 0; i < splatCount; i++) {
                const globalSplatIndex = i + splatOffset;
                if (filterFunc(globalSplatIndex)) {
                    splatMesh.getSplatCenter(globalSplatIndex, center);
                    const addBase = addedCount * 4;
                    sceneCenters[addBase] = center.x;
                    sceneCenters[addBase + 1] = center.y;
                    sceneCenters[addBase + 2] = center.z;
                    sceneCenters[addBase + 3] = globalSplatIndex;
                    addedCount++;
                }
            }
            return sceneCenters;
        };

        return new Promise(resolve => {
            const checkForEarlyExit = (): boolean => {
                if (this.disposed) {
                    this.diposeSplatTreeWorker();
                    resolve();
                    return true;
                }
                return false;
            };

            if (onIndexesUpload) onIndexesUpload(false);

            delayedExecute(() => {
                if (checkForEarlyExit()) return;

                const allCenters: Float32Array[] = [];
                if (splatMesh.dynamicMode) {
                    let splatOffset = 0;
                    for (let s = 0; s < splatMesh.scenes.length; s++) {
                        const scene = splatMesh.getScene(s);
                        const splatCount = scene.splatBuffer.getSplatCount();
                        const sceneCenters = addCentersForScene(splatOffset, splatCount);
                        allCenters.push(sceneCenters);
                        splatOffset += splatCount;
                    }
                } else {
                    const sceneCenters = addCentersForScene(0, splatMesh.getSplatCount());
                    allCenters.push(sceneCenters);
                }

                this.splatTreeWorker!.onmessage = (e: MessageEvent) => {
                    if (checkForEarlyExit()) return;

                    if (e.data.subTrees) {
                        if (onSplatTreeConstruction) onSplatTreeConstruction(false);

                        delayedExecute(() => {
                            if (checkForEarlyExit()) return;

                            for (const workerSubTree of e.data.subTrees) {
                                const convertedSubTree = SplatSubTree.convertWorkerSubTree(
                                    workerSubTree,
                                    splatMesh
                                );
                                this.subTrees.push(convertedSubTree);
                            }
                            this.diposeSplatTreeWorker();

                            if (onSplatTreeConstruction) onSplatTreeConstruction(true);

                            delayedExecute(() => {
                                resolve();
                            });
                        });
                    }
                };

                delayedExecute(() => {
                    if (checkForEarlyExit()) return;
                    if (onIndexesUpload) onIndexesUpload(true);
                    const transferBuffers = allCenters.map(array => array.buffer);
                    workerProcessCenters(
                        this.splatTreeWorker!,
                        allCenters,
                        transferBuffers,
                        this.maxDepth,
                        this.maxCentersPerNode
                    );
                });
            });
        });
    }

    countLeaves(): number {
        let leafCount = 0;
        this.visitLeaves(() => {
            leafCount++;
        });
        return leafCount;
    }

    visitLeaves(visitFunc: (node: SplatTreeNode) => void) {
        const visitLeavesFromNode = (
            node: SplatTreeNode,
            visitFunc: (node: SplatTreeNode) => void
        ) => {
            if (node.children.length === 0) visitFunc(node);
            for (const child of node.children) {
                visitLeavesFromNode(child, visitFunc);
            }
        };

        for (const subTree of this.subTrees) {
            if (subTree.rootNode) {
                visitLeavesFromNode(subTree.rootNode, visitFunc);
            }
        }
    }
}
