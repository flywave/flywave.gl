/* Copyright (C) 2025 flywave.gl contributors */

import { type IBVHBuilder, type onLeafCreationCallback } from "./Builder";
import { type CoordinateSystem, Frustum, WebGLCoordinateSystem } from "./Frustum";
import { intersectBoxBox, intersectRayBox, intersectSphereBox } from "./Intersect";
import { type BVHNode } from "./Node";
import { type FloatArray, minDistanceSqPointToBox, minMaxDistanceSqPointToBox } from "./Utils";

export type onTraverseCallback<N, L> = (node: BVHNode<N, L>, depth: number) => boolean;
export type onIntersectionCallback<L> = (obj: L) => boolean;
export type onClosestDistanceCallback<L> = (obj: L) => number;
export type onIntersectionRayCallback<L> = (obj: L) => void;
export type onFrustumIntersectionCallback<N, L> = (
    node: BVHNode<N, L>,
    frustum?: Frustum,
    mask?: number
) => void;
export type onFrustumIntersectionLODCallback<N, L> = (
    node: BVHNode<N, L>,
    level: number | null,
    frustum?: Frustum,
    mask?: number
) => void;

export interface BVHOptions {
    highPrecision?: boolean;
    coordinateSystem?: CoordinateSystem;
}

export class BVH<N, L> {
    private readonly _builder: IBVHBuilder<N, L>;
    private readonly _frustum: Frustum;
    private readonly _dirInv: FloatArray;
    private readonly _sign = new Uint8Array(3);

    get root(): BVHNode<N, L> | null {
        return this._builder.root;
    }

    constructor(builder: IBVHBuilder<N, L>, options?: BVHOptions) {
        this._builder = builder;
        const { highPrecision = false, coordinateSystem = WebGLCoordinateSystem } = options || {};
        this._frustum = new Frustum(highPrecision, coordinateSystem);
        this._dirInv = highPrecision ? new Float64Array(3) : new Float32Array(3);
    }

    public createFromArray(
        objects: L[],
        boxes: FloatArray[],
        onLeafCreation?: onLeafCreationCallback<N, L>,
        margin?: number
    ): void {
        if (objects?.length > 0) {
            this._builder.createFromArray(objects, boxes, onLeafCreation, margin);
        }
    }

    public insert(object: L, box: FloatArray, margin: number): BVHNode<N, L> {
        return this._builder.insert(object, box, margin);
    }

    public insertRange(
        objects: L[],
        boxes: FloatArray[],
        margins?: number | FloatArray | number[],
        onLeafCreation?: onLeafCreationCallback<N, L>
    ): void {
        if (objects?.length > 0) {
            this._builder.insertRange(objects, boxes, margins, onLeafCreation);
        }
    }

    public move(node: BVHNode<N, L>, margin: number): void {
        this._builder.move(node, margin);
    }

    public delete(node: BVHNode<N, L>): BVHNode<N, L> | null {
        return this._builder.delete(node);
    }

    public clear(): void {
        this._builder.clear();
    }

    public traverse(callback: onTraverseCallback<N, L>): void {
        if (this.root === null) return;

        _traverse(this.root, 0);

        function _traverse(node: BVHNode<N, L>, depth: number): void {
            if (node.object !== undefined) {
                // is leaf
                callback(node, depth);
                return;
            }

            const stopTraversal = callback(node, depth);

            if (!stopTraversal) {
                _traverse(node.left!, depth + 1);
                _traverse(node.right!, depth + 1);
            }
        }
    }

    public intersects(
        type: "ray" | "box" | "sphere",
        params: {
            dir?: FloatArray;
            origin?: FloatArray;
            box?: FloatArray;
            center?: FloatArray;
            radius?: number;
        },
        callback: onIntersectionCallback<L>
    ): boolean {
        if (!this.root) return false;

        switch (type) {
            case "ray":
                return this.intersectsRay(params.dir!, params.origin!, callback);
            case "box":
                return this.intersectsBox(params.box!, callback);
            case "sphere":
                return this.intersectsSphere(params.center!, params.radius!, callback);
            default:
                throw new Error("Invalid intersection type");
        }
    }

    public intersectsRay(
        dir: FloatArray,
        origin: FloatArray,
        onIntersection: onIntersectionCallback<L>,
        near = 0,
        far = Infinity
    ): boolean {
        if (this.root === null) return false;

        const dirInv = this._dirInv;
        const sign = this._sign;

        dirInv[0] = 1 / dir[0];
        dirInv[1] = 1 / dir[1];
        dirInv[2] = 1 / dir[2];

        sign[0] = dirInv[0] < 0 ? 1 : 0;
        sign[1] = dirInv[1] < 0 ? 1 : 0;
        sign[2] = dirInv[2] < 0 ? 1 : 0;

        return _intersectsRay(this.root);

        function _intersectsRay(node: BVHNode<N, L>): boolean {
            if (!intersectRayBox(node.box, origin, dirInv, sign, near, far)) return false;

            if (node.object !== undefined) return onIntersection(node.object);

            return _intersectsRay(node.left!) || _intersectsRay(node.right!);
        }
    }

    public intersectsBox(box: FloatArray, onIntersection: onIntersectionCallback<L>): boolean {
        if (this.root === null) return false;

        return _intersectsBox(this.root);

        function _intersectsBox(node: BVHNode<N, L>): boolean {
            if (!intersectBoxBox(box, node.box)) return false;

            if (node.object !== undefined) return onIntersection(node.object);

            return _intersectsBox(node.left!) || _intersectsBox(node.right!);
        }
    }

    public intersectsSphere(
        center: FloatArray,
        radius: number,
        onIntersection: onIntersectionCallback<L>
    ): boolean {
        if (this.root === null) return false;

        return _intersectsSphere(this.root);

        function _intersectsSphere(node: BVHNode<N, L>): boolean {
            if (!intersectSphereBox(center, radius, node.box)) return false;

            if (node.object !== undefined) return onIntersection(node.object);

            return _intersectsSphere(node.left!) || _intersectsSphere(node.right!);
        }
    }

    public isNodeIntersected(
        node: BVHNode<N, L>,
        onIntersection: onIntersectionCallback<L>
    ): boolean {
        const nodeBox = node.box;
        let parent;

        while ((parent = node.parent)) {
            const oppositeNode = parent.left === node ? parent.right : parent.left;

            if (_isNodeIntersected(oppositeNode!)) return true;

            node = parent;
        }

        return false;

        function _isNodeIntersected(node: BVHNode<N, L>): boolean {
            if (!intersectBoxBox(nodeBox, node.box)) return false;

            if (node.object !== undefined) return onIntersection(node.object);

            return _isNodeIntersected(node.left!) || _isNodeIntersected(node.right!);
        }
    }

    public rayIntersections(
        dir: FloatArray,
        origin: FloatArray,
        onIntersection: onIntersectionRayCallback<L>,
        near = 0,
        far = Infinity
    ): void {
        if (this.root === null) return;

        const dirInv = this._dirInv;
        const sign = this._sign;

        dirInv[0] = 1 / dir[0];
        dirInv[1] = 1 / dir[1];
        dirInv[2] = 1 / dir[2];

        sign[0] = dirInv[0] < 0 ? 1 : 0;
        sign[1] = dirInv[1] < 0 ? 1 : 0;
        sign[2] = dirInv[2] < 0 ? 1 : 0;

        _rayIntersections(this.root);

        function _rayIntersections(node: BVHNode<N, L>): void {
            if (!intersectRayBox(node.box, origin, dirInv, sign, near, far)) return;

            if (node.object !== undefined) {
                onIntersection(node.object);
                return;
            }

            _rayIntersections(node.left!);
            _rayIntersections(node.right!);
        }
    }

    public frustumCulling(
        projectionMatrix: FloatArray | number[],
        onIntersection: onFrustumIntersectionCallback<N, L>
    ): void {
        this._frustumCullingBase(projectionMatrix, (node, frustum, mask) => {
            onIntersection(node, frustum, mask);
        });
    }

    public frustumCullingLOD(
        projectionMatrix: FloatArray | number[],
        cameraPosition: FloatArray,
        levels: FloatArray,
        onIntersection: onFrustumIntersectionLODCallback<N, L>
    ): void {
        this._frustumCullingBase(projectionMatrix, (node, frustum, mask) => {
            const level = this._getLODLevel(node.box, cameraPosition, levels);
            onIntersection(node, level, frustum, mask);
        });
    }

    private _frustumCullingBase(
        projectionMatrix: FloatArray | number[],
        callback: (node: BVHNode<N, L>, frustum: Frustum, mask: number) => void
    ): void {
        if (!this.root) return;

        const frustum = this._frustum.setFromProjectionMatrix(projectionMatrix);
        const traverse = (node: BVHNode<N, L>, mask: number): void => {
            if (node.object !== undefined) {
                if (frustum.isIntersected(node.box, mask)) {
                    callback(node, frustum, mask);
                }
                return;
            }

            mask = frustum.intersectsBoxMask(node.box, mask);
            if (mask < 0) return;

            if (mask === 0) {
                this._traverseAll(node, () => {
                    callback(node, frustum, 0);
                });
                return;
            }

            traverse(node.left!, mask);
            traverse(node.right!, mask);
        };

        traverse(this.root, 0b111111);
    }

    private _traverseAll(node: BVHNode<N, L>, callback: () => void): void {
        if (node.object !== undefined) {
            callback();
            return;
        }
        this._traverseAll(node.left!, callback);
        this._traverseAll(node.right!, callback);
    }

    private _getLODLevel(
        box: FloatArray,
        cameraPosition: FloatArray,
        levels: FloatArray
    ): number | null {
        const { min, max } = minMaxDistanceSqPointToBox(box, cameraPosition);

        for (let i = levels.length - 1; i > 0; i--) {
            if (max >= levels[i]) {
                return min >= levels[i] ? i : null;
            }
        }
        return 0;
    }

    public closestPointToPoint(
        point: FloatArray,
        onClosestDistance?: onClosestDistanceCallback<L>
    ): number | undefined {
        if (this.root === null) return;

        let bestDistance = Infinity;

        _closestPointToPoint(this.root);

        return Math.sqrt(bestDistance);

        function _closestPointToPoint(node: BVHNode<N, L>): void {
            if (node.object !== undefined) {
                if (onClosestDistance) {
                    const distance =
                        onClosestDistance(node.object) ?? minDistanceSqPointToBox(node.box, point);
                    if (distance < bestDistance) bestDistance = distance;
                } else {
                    bestDistance = minDistanceSqPointToBox(node.box, point); // this was already calculated actually
                }

                return;
            }

            const leftDistance = minDistanceSqPointToBox(node.left!.box, point);
            const rightDistance = minDistanceSqPointToBox(node.right!.box, point);

            if (leftDistance < rightDistance) {
                if (leftDistance < bestDistance) {
                    _closestPointToPoint(node.left!);
                    if (rightDistance < bestDistance) _closestPointToPoint(node.right!);
                }
            } else if (rightDistance < bestDistance) {
                _closestPointToPoint(node.right!);
                if (leftDistance < bestDistance) _closestPointToPoint(node.left!);
            }
        }
    }
}
