import { FlatArray } from '../utils/flatarray'

export type Polygon = FlatArray<number>;

interface IPoint {
    x: number;
    y: number;
    entering?: boolean;
}

interface IPolygonNode {
    point: IPoint;
    next: IPolygonNode | null;
    prev: IPolygonNode | null;
    ear?: boolean;
}

class PolygonList {
    length: number = 0;
    first: IPolygonNode | null = null;
    last: IPolygonNode | null = null;

    add(point: IPoint): void {
        const node: IPolygonNode = {
            point,
            next: null,
            prev: null,
            ear: false
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

    insertBefore(point: IPoint, node: IPolygonNode): void {
        const newNode: IPolygonNode = {
            point,
            prev: node.prev,
            next: node,
            ear: false
        };

        if (!node.prev) {
            this.first = newNode;
        } else {
            node.prev.next = newNode;
        }
        node.prev = newNode;
        this.length++;
    }
}

function lineIntersects(
    line1StartX: number, line1StartY: number,
    line1EndX: number, line1EndY: number,
    line2StartX: number, line2StartY: number,
    line2EndX: number, line2EndY: number
): [number, number] | false {
    const denominator = ((line2EndY - line2StartY) * (line1EndX - line1StartX)) -
        ((line2EndX - line2StartX) * (line1EndY - line1StartY));

    if (denominator === 0) return false;

    const a = line1StartY - line2StartY;
    const b = line1StartX - line2StartX;
    const numerator1 = ((line2EndX - line2StartX) * a) - ((line2EndY - line2StartY) * b);
    const numerator2 = ((line1EndX - line1StartX) * a) - ((line1EndY - line1StartY) * b);
    const aResult = numerator1 / denominator;
    const bResult = numerator2 / denominator;

    if (aResult > 0 && aResult < 1 && bResult > 0 && bResult < 1) {
        return [
            line1StartX + (aResult * (line1EndX - line1StartX)),
            line1StartY + (aResult * (line1EndY - line1StartY))
        ];
    }
    return false;
}

function isInside(point: [number, number], polygon: Polygon): boolean {
    const [x, y] = point;
    let isInside = false;

    for (let i = 0, j = polygon.count - 1; i < polygon.count; j = i++) {
        const [xi, yi] = polygon.itemAt(i);
        const [xj, yj] = polygon.itemAt(j);

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

export function weilerAthertonClip(subject: Polygon, clip: Polygon): Polygon[] {
    const subjectRing = subject;
    const subjectList = new PolygonList();
    const clipList = new PolygonList();

    // 初始化多边形链表
    subject.forEach((item) => {
        subjectList.add({ x: item[0], y: item[1] });
    })
    clip.forEach((item) => {
        clipList.add({ x: item[0], y: item[1] });
    })

    // 查找所有交点并插入到链表中
    let currentSubject = subjectList.first;
    for (let i = 0; i < subject.count && currentSubject; i++) {
        let currentClip = clipList.first;
        for (let k = 0; k < clip.count && currentClip; k++) {
            if (!currentSubject?.next || !currentClip?.next) continue;

            const intersection = lineIntersects(
                currentSubject.point.x, currentSubject.point.y,
                currentSubject.next.point.x, currentSubject.next.point.y,
                currentClip.point.x, currentClip.point.y,
                currentClip.next.point.x, currentClip.next.point.y
            );

            if (intersection) {
                const isEntering = !isInside([currentClip.point.x, currentClip.point.y], subjectRing);
                const intersectionPoint = { x: intersection[0], y: intersection[1], entering: isEntering };

                subjectList.insertBefore(intersectionPoint, currentSubject.next);
                clipList.insertBefore(intersectionPoint, currentClip.next);
            }
            currentClip = currentClip.next;
        }
        currentSubject = currentSubject.next;
    }

    // 收集结果多边形
    const result: Polygon[] = [];
    let currentNode = subjectList.first;

    while (currentNode) {
        if (currentNode.point.entering !== undefined) {
            const polygon = FlatArray.create<number>({ array: [], itemSize: 2 });
            let isInsideClip = currentNode.point.entering;

            while (currentNode) {
                polygon.push([currentNode.point.x, currentNode.point.y]);

                if (currentNode.point.entering !== undefined) {
                    // 切换到另一个多边形链表
                    const targetList = isInsideClip ? clipList : subjectList;
                    const searchPoint = { x: currentNode.point.x, y: currentNode.point.y };

                    // 在另一个链表中找到对应的交点节点
                    let foundNode = targetList.first;
                    while (foundNode) {
                        if (Math.abs(foundNode.point.x - searchPoint.x) < 1e-10 &&
                            Math.abs(foundNode.point.y - searchPoint.y) < 1e-10) {
                            currentNode = foundNode;
                            isInsideClip = !isInsideClip;
                            break;
                        }
                        foundNode = foundNode.next;
                    }
                }

                currentNode = currentNode.next;
                // 如果回到起点，完成一个多边形
                if (currentNode &&
                    Math.abs(currentNode.point.x - polygon.itemAt(0)[0]) < 1e-10 &&
                    Math.abs(currentNode.point.y - polygon.itemAt(0)[1]) < 1e-10) {
                    break;
                }
            }

            if (polygon.count > 2) {
                result.push(polygon);
            }
        } else {
            currentNode = currentNode.next;
        }
    }

    return result;
}