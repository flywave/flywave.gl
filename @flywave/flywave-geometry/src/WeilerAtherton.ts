/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable no-mixed-operators */
import { FlatArray } from "@flywave/flywave-utils";
import { Vector2 } from "three";

interface IPolygonNode {
    point: Vector2;
    next: IPolygonNode | null;
    prev: IPolygonNode | null;
    entering?: boolean;
    processed?: boolean;
    intersect?: boolean;
    corresponding?: IPolygonNode; // Add this line
}

class PolygonList {
    length: number = 0;
    first: IPolygonNode | null = null;
    last: IPolygonNode | null = null;

    add(point: Vector2, entering?: boolean): IPolygonNode {
        const node: IPolygonNode = {
            point,
            next: null,
            prev: null,
            entering,
            processed: false,
            intersect: entering !== undefined
        };

        if (!this.length) {
            this.first = this.last = node;
        } else {
            if (this.last) {
                this.last.next = node;
                node.prev = this.last;
                this.last = node;
            }
        }
        this.length++;
        return node;
    }

    remove(node: IPolygonNode): void {
        if (!this.length) return;

        if (node === this.first) {
            this.first = this.first.next;
            if (!this.first) this.last = null;
            else this.first.prev = null;
        } else if (node === this.last) {
            if (this.last?.prev) {
                this.last = this.last.prev;
                this.last.next = null;
            }
        } else {
            if (node.prev) node.prev.next = node.next;
            if (node.next) node.next.prev = node.prev;
        }

        node.prev = null;
        node.next = null;
        this.length--;
    }

    insertBefore(point: Vector2, node: IPolygonNode, entering?: boolean): IPolygonNode {
        const newNode: IPolygonNode = {
            point,
            prev: node.prev,
            next: node,
            entering,
            processed: false,
            intersect: entering !== undefined
        };

        if (!node.prev) {
            this.first = newNode;
        } else {
            node.prev.next = newNode;
        }
        node.prev = newNode;
        this.length++;
        return newNode;
    }

    clearFlags(): void {
        let current = this.first;
        while (current) {
            current.processed = false;
            current = current.next;
        }
    }
}

class WeilerAthertonClipper {
    private readonly subjectList: PolygonList;
    private readonly clipList: PolygonList;

    constructor(subject: FlatArray<number>, clip: FlatArray<number>) {
        this.subjectList = this.buildPolygonList(subject);
        this.clipList = this.buildPolygonList(clip);
    }

    execute(): Array<FlatArray<number>> {
        this.processIntersections();
        return this.collectResults();
    }

    private buildPolygonList(polygon: FlatArray<number>): PolygonList {
        const list = new PolygonList();
        polygon.forEach(item => {
            list.add(new Vector2(item[0], item[1]));
        });
        return list;
    }

    private processIntersections(): void {
        let currentSubject = this.subjectList.first;
        while (currentSubject) {
            const subjectNext = currentSubject.next || this.subjectList.first;
            if (!subjectNext) break;

            let currentClip = this.clipList.first;
            while (currentClip) {
                const clipNext = currentClip.next || this.clipList.first;
                if (!clipNext) break;

                const intersection = this.calculateIntersection(
                    currentSubject.point,
                    subjectNext.point,
                    currentClip.point,
                    clipNext.point
                );

                if (intersection) {
                    this.insertIntersectionPoints(intersection, currentSubject, currentClip);
                }
                currentClip = currentClip.next;
            }
            currentSubject = currentSubject.next;
        }
    }

    private calculateIntersection(
        a1: Vector2,
        a2: Vector2,
        b1: Vector2,
        b2: Vector2
    ): Vector2 | null {
        const denominator = (b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y);
        if (denominator === 0) return null;

        const numerator1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
        const numerator2 = (a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x);
        const a = numerator1 / denominator;
        const b = numerator2 / denominator;

        return a > 0 && a < 1 && b > 0 && b < 1
            ? new Vector2(a1.x + a * (a2.x - a1.x), a1.y + a * (a2.y - a1.y))
            : null;
    }

    private insertIntersectionPoints(
        point: Vector2,
        subjectNode: IPolygonNode,
        clipNode: IPolygonNode
    ): void {
        const isEntering = !this.isPointInsideClip(clipNode.point);

        // Insert into subject polygon
        const subjectIntersection = this.subjectList.insertBefore(
            point.clone(),
            subjectNode.next || this.subjectList.first!,
            isEntering
        );

        // Insert into clip polygon
        const clipIntersection = this.clipList.insertBefore(
            point.clone(),
            clipNode.next || this.clipList.first!,
            !isEntering
        );

        // Link intersection nodes for easy traversal
        subjectIntersection.corresponding = clipIntersection;
        clipIntersection.corresponding = subjectIntersection;
    }

    private isPointInsideClip(point: Vector2): boolean {
        let isInside = false;
        let current = this.clipList.first;
        if (!current) return false;

        do {
            const next = current.next || this.clipList.first;
            if (!next) break;

            const xi = current.point.x;
            const yi = current.point.y;
            const xj = next.point.x;
            const yj = next.point.y;

            const intersect =
                yi > point.y !== yj > point.y && // Add parentheses around comparisons
                point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
            if (intersect) isInside = !isInside;

            current = next;
        } while (current !== this.clipList.first);

        return isInside;
    }

    private collectResults(): Array<FlatArray<number>> {
        const results: Array<FlatArray<number>> = [];
        this.subjectList.clearFlags();
        this.clipList.clearFlags();

        let currentNode = this.subjectList.first;
        while (currentNode) {
            if (currentNode.intersect && !currentNode.processed) {
                const polygon = this.tracePolygon(currentNode);
                if (polygon.count > 2) {
                    results.push(polygon);
                }
                currentNode = this.skipProcessedNodes(currentNode);
            } else {
                currentNode = currentNode.next;
            }
        }
        return results;
    }

    private skipProcessedNodes(node: IPolygonNode): IPolygonNode | null {
        let current = node;
        while (current && current.processed) {
            current = current.next;
        }
        return current;
    }

    private getNextNode(node: IPolygonNode, isInsideClip: boolean): IPolygonNode {
        if (!node.intersect) {
            return isInsideClip
                ? node.next || this.subjectList.first!
                : node.prev || this.subjectList.last!;
        }

        node.processed = true;
        const corresponding = node.corresponding;
        if (corresponding) {
            corresponding.processed = true;
        }

        if (isInsideClip) {
            return node.next || this.subjectList.first!;
        } else {
            if (node.corresponding) {
                const clipNode = node.corresponding;
                return clipNode.prev || this.clipList.last!;
            }
            return node.prev || this.subjectList.last!;
        }
    }

    private tracePolygon(startNode: IPolygonNode): FlatArray<number> {
        const polygon = FlatArray.create<number>({ array: [], itemSize: 2 });
        let current = startNode;
        let isInsideClip = current.entering!;

        do {
            polygon.push([current.point.x, current.point.y]);
            current.processed = true;
            current = this.getNextNode(current, isInsideClip);
            isInsideClip = !isInsideClip;
        } while (current !== startNode && !current.processed);

        return polygon;
    }
}

export function weilerAthertonClip(
    subject: FlatArray<number>,
    clip: FlatArray<number>
): Array<FlatArray<number>> {
    if (subject.count < 3 || clip.count < 3) {
        return [];
    }
    return new WeilerAthertonClipper(subject, clip).execute();
}
