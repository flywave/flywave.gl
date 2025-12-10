/* Copyright (C) 2025 flywave.gl contributors */

import { type BVHNode } from "./Node";
import {
    type FloatArray,
    type FloatArrayType,
    areaBox,
    areaFromTwoBoxes,
    expandBoxByMargin,
    getLongestAxis,
    isBoxInsideBox,
    isExpanded,
    SortedListPriority,
    unionBox,
    unionBoxChanged
} from "./Utils";

export type onLeafCreationCallback<N, L> = (node: BVHNode<N, L>) => void;

export interface IBVHBuilder<N, L> {
    root: BVHNode<N, L> | null;
    createFromArray(
        objects: L[],
        boxes: FloatArray[],
        onLeafCreation?: onLeafCreationCallback<N, L>,
        margin?: number
    ): void;
    insert(object: L, box: FloatArray, margin: number): BVHNode<N, L>;
    insertRange(
        objects: L[],
        boxes: FloatArray[],
        margins?: number | FloatArray | number[],
        onLeafCreation?: onLeafCreationCallback<N, L>
    ): void;
    move(node: BVHNode<N, L>, margin: number): void;
    delete(node: BVHNode<N, L>): BVHNode<N, L> | null;
    clear(): void;
    readonly highPrecision: boolean;
}

export class HybridBuilder<N = {}, L = {}> implements IBVHBuilder<N, L> {
    public root: BVHNode<N, L> | null = null;
    public readonly highPrecision: boolean;
    protected _sortedList = new SortedListPriority();
    protected _typeArray: FloatArrayType;
    protected count = 0;

    constructor(highPrecision = false) {
        this.highPrecision = highPrecision;
        this._typeArray = highPrecision ? Float64Array : Float32Array;
    }

    public createFromArray(
        objects: L[],
        boxes: FloatArray[],
        onLeafCreation?: onLeafCreationCallback<N, L>,
        margin = 0
    ): void {
        if (boxes.length === 0) {
            this.root = null;
            return;
        }

        const maxCount = boxes.length;
        const typeArray = this._typeArray;
        const centroid = new typeArray(6);
        let axis: number;
        let position: number;

        this.root = buildNode(0, maxCount, null);

        function buildNode(
            offset: number,
            count: number,
            parent: BVHNode<N, L> | null
        ): BVHNode<N, L> {
            if (count === 1) {
                const box = boxes[offset];
                if (margin > 0) expandBoxByMargin(box, margin);
                const node = { box, object: objects[offset], parent } as BVHNode<N, L>;
                if (onLeafCreation) onLeafCreation(node);
                return node;
            }

            const box = computeBoxCentroid(offset, count);

            updateSplitData();

            let leftEndOffset = split(offset, count);

            if (leftEndOffset === offset || leftEndOffset === offset + count) {
                leftEndOffset = offset + (count >> 1);
            }

            const node = { box, parent } as BVHNode<N, L>;

            node.left = buildNode(offset, leftEndOffset - offset, node);
            node.right = buildNode(leftEndOffset, count - leftEndOffset + offset, node);

            return node;
        }

        function computeBoxCentroid(offset: number, count: number): FloatArray {
            const box = new typeArray(6);
            const end = offset + count;

            box[0] = Infinity;
            box[1] = -Infinity;
            box[2] = Infinity;
            box[3] = -Infinity;
            box[4] = Infinity;
            box[5] = -Infinity;

            centroid[0] = Infinity;
            centroid[1] = -Infinity;
            centroid[2] = Infinity;
            centroid[3] = -Infinity;
            centroid[4] = Infinity;
            centroid[5] = -Infinity;

            for (let i = offset; i < end; i++) {
                const boxToCheck = boxes[i];

                const xMin = boxToCheck[0];
                const xMax = boxToCheck[1];
                const yMin = boxToCheck[2];
                const yMax = boxToCheck[3];
                const zMin = boxToCheck[4];
                const zMax = boxToCheck[5];

                if (box[0] > xMin) box[0] = xMin;
                if (box[1] < xMax) box[1] = xMax;
                if (box[2] > yMin) box[2] = yMin;
                if (box[3] < yMax) box[3] = yMax;
                if (box[4] > zMin) box[4] = zMin;
                if (box[5] < zMax) box[5] = zMax;

                const xCenter = (xMax + xMin) * 0.5;
                const yCenter = (yMax + yMin) * 0.5;
                const zCenter = (zMax + zMin) * 0.5;

                if (centroid[0] > xCenter) centroid[0] = xCenter;
                if (centroid[1] < xCenter) centroid[1] = xCenter;
                if (centroid[2] > yCenter) centroid[2] = yCenter;
                if (centroid[3] < yCenter) centroid[3] = yCenter;
                if (centroid[4] > zCenter) centroid[4] = zCenter;
                if (centroid[5] < zCenter) centroid[5] = zCenter;
            }

            box[0] -= margin;
            box[1] += margin;
            box[2] -= margin;
            box[3] += margin;
            box[4] -= margin;
            box[5] += margin;

            return box;
        }

        // function updateSplitData(box?: FloatArray, offset?: number, count?: number): void { TODO
        function updateSplitData(): void {
            axis = getLongestAxis(centroid) * 2; // or we can get average
            position = (centroid[axis] + centroid[axis + 1]) * 0.5;
        }

        function split(offset: number, count: number): number {
            let left = offset;
            let right = offset + count - 1;

            while (left <= right) {
                const boxLeft = boxes[left];
                if ((boxLeft[axis + 1] + boxLeft[axis]) * 0.5 >= position) {
                    // if equals, lies on right
                    while (true) {
                        const boxRight = boxes[right];
                        if ((boxRight[axis + 1] + boxRight[axis]) * 0.5 < position) {
                            const tempObject = objects[left];
                            objects[left] = objects[right];
                            objects[right] = tempObject;

                            const tempBox = boxes[left];
                            boxes[left] = boxes[right];
                            boxes[right] = tempBox;

                            right--;
                            break;
                        }

                        right--;
                        if (right <= left) return left;
                    }
                }

                left++;
            }

            return left;
        }
    }

    public insert(object: L, box: FloatArray, margin: number): BVHNode<N, L> {
        this.validateBox(box); // Add validation
        if (margin > 0) expandBoxByMargin(box, margin);
        const leaf = this.createLeafNode(object, box);

        if (this.root === null) this.root = leaf;
        else this.insertLeaf(leaf);

        this.count++;
        return leaf;
    }

    public insertRange(
        objects: L[],
        boxes: FloatArray[],
        margins?: number | number[],
        onLeafCreation?: onLeafCreationCallback<N, L>
    ): void {
        const count = objects.length;
        // Validate all input boxes
        for (const box of boxes) {
            this.validateBox(box);
        }
        // Unified processing of margin parameters
        const marginValues =
            typeof margins === "number"
                ? new Array(count).fill(margins)
                : margins || new Array(count).fill(0);

        for (let i = 0; i < count; i++) {
            const node = this.insert(objects[i], boxes[i], marginValues[i]);
            if (onLeafCreation) onLeafCreation(node);
        }
    }

    public move(node: BVHNode<N, L>, margin: number): void {
        if (!node.parent || isBoxInsideBox(node.box, node.parent.box)) {
            if (margin > 0) expandBoxByMargin(node.box, margin);
            return;
        }

        if (margin > 0) expandBoxByMargin(node.box, margin);

        const deletedNode = this.delete(node);
        this.insertLeaf(node, deletedNode);
        this.count++;
    }

    public delete(node: BVHNode<N, L>): BVHNode<N, L> | null {
        const parent = node.parent;

        if (parent === null || parent === undefined) {
            this.root = null;
            return null;
        }

        const parent2 = parent.parent;
        const oppositeLeaf = parent.left === node ? parent.right : parent.left;

        if (oppositeLeaf) {
            return null;
        }

        if (parent2 === null || parent2 === undefined) {
            this.root = oppositeLeaf || null;
            return parent;
        }

        if (parent2.left === parent) parent2.left = oppositeLeaf;
        else parent2.right = oppositeLeaf;

        this.refit(parent2); // i don't think we need rotation here

        this.count--;

        return parent;
    }

    public clear(): void {
        this.root = null;
    }

    protected insertLeaf(leaf: BVHNode<N, L>, newParent?: BVHNode<N, L> | null): void {
        this.validateBox(leaf.box); // Validate leaf node box
        const sibling = this.findBestSibling(leaf.box);

        const oldParent = sibling.parent;

        if (oldParent === undefined) {
            return;
        }

        if (newParent === undefined || newParent === null) {
            newParent = this.createInternalNode(oldParent, sibling, leaf);
        } else {
            newParent.parent = oldParent;
            newParent.left = sibling;
            newParent.right = leaf;
        }

        sibling.parent = newParent;
        leaf.parent = newParent;

        if (oldParent === null) this.root = newParent;
        else if (oldParent.left === sibling) oldParent.left = newParent;
        else oldParent.right = newParent;

        this.refitAndRotate(leaf, sibling);
    }

    protected createLeafNode(object: L, box: FloatArray): BVHNode<N, L> {
        this.validateBox(box); // Validate box when creating node
        return { box, object, parent: null } as BVHNode<N, L>;
    }

    protected createInternalNode(
        parent: BVHNode<N, L>,
        sibling: BVHNode<N, L>,
        leaf: BVHNode<N, L>
    ): BVHNode<N, L> {
        return { parent, left: sibling, right: leaf, box: new this._typeArray(6) } as BVHNode<N, L>;
    }

    protected findBestSibling(leafBox: FloatArray): BVHNode<N, L> {
        let bestNode = this.root!;
        let bestCost = areaFromTwoBoxes(leafBox, bestNode.box);
        const leafArea = areaBox(leafBox);

        const stack: Array<{ node: BVHNode<N, L>; inheritedCost: number }> = [];
        if (bestNode.left) {
            stack.push({
                node: bestNode.left,
                inheritedCost: bestCost - areaBox(bestNode.box)
            });
        }

        while (stack.length > 0) {
            const { node, inheritedCost } = stack.pop()!;
            const directCost = areaFromTwoBoxes(leafBox, node.box);
            const currentCost = directCost + inheritedCost;

            if (currentCost < bestCost) {
                bestCost = currentCost;
                bestNode = node;
            }

            if (node.left && node.right) {
                const newInheritedCost = currentCost - areaBox(node.box);
                if (leafArea + newInheritedCost < bestCost) {
                    stack.push(
                        { node: node.left, inheritedCost: newInheritedCost },
                        { node: node.right, inheritedCost: newInheritedCost }
                    );
                }
            }
        }

        return bestNode;
    }

    protected refit(node: BVHNode<N, L> | undefined): void {
        if (node === undefined) return;
        this.validateBox(node.left!.box); // Validate child node box
        this.validateBox(node.right!.box);
        unionBox(node.left!.box, node.right!.box, node.box);

        while ((node = node?.parent)) {
            if (!unionBoxChanged(node.left!.box, node.right!.box, node.box)) return;
        }
    }

    protected refitAndRotate(node: BVHNode<N, L> | undefined | null, sibling: BVHNode<N, L>): void {
        if (node === undefined || node === null) return;
        const originalNodeBox = node.box;
        node = node.parent!;
        const nodeBox = node.box;

        unionBox(originalNodeBox, sibling.box, nodeBox);

        while ((node = node.parent)) {
            const nodeBox = node.box;

            // we can use 'expandBox(originalNodeBox, nodeBox);' here if we want to performs all rotation
            if (!isExpanded(originalNodeBox, nodeBox)) return; // this avoid some rotations but is less expensive

            const left = node.left!;
            const right = node.right!;
            const leftBox = left.box;
            const rightBox = right.box;

            let nodeSwap1: BVHNode<N, L> | null = null;
            let nodeSwap2: BVHNode<N, L> | null = null;
            let bestCost = 0;

            if (right.object === undefined) {
                // is not leaf
                const RL = right.left!;
                const RR = right.right!;
                const rightArea = areaBox(right.box);

                const diffRR = rightArea - areaFromTwoBoxes(leftBox, RL.box);
                const diffRL = rightArea - areaFromTwoBoxes(leftBox, RR.box);

                if (diffRR > diffRL) {
                    if (diffRR > 0) {
                        nodeSwap1 = left;
                        nodeSwap2 = RR;
                        bestCost = diffRR;
                    }
                } else if (diffRL > 0) {
                    nodeSwap1 = left;
                    nodeSwap2 = RL;
                    bestCost = diffRL;
                }
            }

            if (left.object === undefined) {
                // is not leaf
                const LL = left.left!;
                const LR = left.right!;
                const leftArea = areaBox(left.box);

                const diffLR = leftArea - areaFromTwoBoxes(rightBox, LL.box);
                const diffLL = leftArea - areaFromTwoBoxes(rightBox, LR.box);

                if (diffLR > diffLL) {
                    if (diffLR > bestCost) {
                        nodeSwap1 = right;
                        nodeSwap2 = LR;
                    }
                } else if (diffLL > bestCost) {
                    nodeSwap1 = right;
                    nodeSwap2 = LL;
                }
            }

            if (nodeSwap1 !== null) this.swap(nodeSwap1, nodeSwap2);
        }
    }

    // this works only for rotation
    protected swap(A: BVHNode<N, L> | null, B: BVHNode<N, L> | null): void {
        const parentA = A!.parent!;
        const parentB = B!.parent!;
        const parentBox = parentB.box;

        if (parentA.left === A) parentA.left = B;
        else parentA.right = B;

        if (parentB.left === B) parentB.left = A;
        else parentB.right = A;

        A!.parent = parentB;
        B!.parent = parentA;

        unionBox(parentB.left!.box, parentB.right!.box, parentBox);
    }

    private validateBox(box: FloatArray): void {
        if (box.length !== 6) {
            throw new Error("Invalid box size");
        }
        if (box[0] > box[1] || box[2] > box[3] || box[4] > box[5]) {
            throw new Error("Invalid box coordinates");
        }
    }
}
