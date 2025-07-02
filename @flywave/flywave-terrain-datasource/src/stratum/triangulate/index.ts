import { Vector } from "../utils/vector";
import { cdt } from "../delaunay";
import { cross, dot, minus, normalize, plus, times } from "../utils/vector";
import { FlatArray } from "../utils/flatarray";

export function triangulate(polygon: Vector[]): { positions: Vector[], indices: number[][] } {
    if (polygon.length < 3) {
        throw new Error('Polygon needs at least three points');
    }

    // 计算多边形法向量
    const normal = computePolygonNormal(polygon);
    if (length3D(normal) < 1e-6) {
        throw new Error('Polygon is not planar');
    }

    // 构建局部坐标系
    const origin = polygon[0];
    const basis1 = normalize(minus(polygon[1], origin));
    const temp = minus(polygon[2], origin);
    let basis2;
    const perp = minus(temp, times(basis1, dot(temp, basis1)));
    const perpLength = length3D(perp);

    if (perpLength > 1e-6) {
        basis2 = normalize(perp);
    } else {
        // 尝试其他点构建坐标系
        for (let i = 3; i < polygon.length; i++) {
            const altPoint = minus(polygon[i], origin);
            const altPerp = minus(altPoint, times(basis1, dot(altPoint, basis1)));
            if (length3D(altPerp) > 1e-6) {
                basis2 = normalize(altPerp);
                break;
            }
        }
        if (!basis2) {
            throw new Error('All points are collinear');
        }
    }

    // 生成二维投影坐标
    const flatArray = polygon.flatMap(p => {
        const rel = minus(p, origin);
        return [dot(rel, basis1), dot(rel, basis2)];
    });

    const positions = FlatArray.create<number>({ array: flatArray, itemSize: 2 });
    // 添加所有多边形边界作为约束边
    const constraintEdges = [];
    for (let i = 0; i < polygon.length; i++) {
        constraintEdges.push(i, (i + 1) % polygon.length);
    }
    const findices = FlatArray.create<number>({
        array: constraintEdges,
        itemSize: 2
    });
    // 执行三角剖分
    const result = cdt({
        positions,
        indices: findices
    });

    // 转换结果为三维索引
    const indices2D = result.indices.array;
    const indices: number[][] = [];
    for (let i = 0; i < indices2D.length; i += 3) {
        indices.push([indices2D[i], indices2D[i + 1], indices2D[i + 2]]);
    }

    return {
        positions: polygon, // 保持原始三维坐标
        indices
    };
}

// 三维向量长度计算
function length3D(v: Vector): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

// 多边形法向量计算
function computePolygonNormal(poly: Vector[]): Vector {
    let normal = { x: 0, y: 0, z: 0 };
    const p0 = poly[0];

    for (let i = 1; i < poly.length - 1; i++) {
        const v1 = minus(poly[i], p0);
        const v2 = minus(poly[i + 1], p0);
        const crossProd = cross(v1, v2);
        normal = plus(normal, crossProd);
    }

    return normalize(normal);
}