import { GeoBox, GeoCoordinatesLike, Projection } from "@flywave/flywave-geoutils";
import * as THREE from "three";

export function toTileLocal(
    header: { boundingSphereCenterX?: number; boundingSphereCenterY?: number; boundingSphereCenterZ?: number },
    geoPoint: GeoCoordinatesLike | THREE.Vector3,
    project?: Projection
): THREE.Vector3 {
    const { boundingSphereCenterX: cx = 0, boundingSphereCenterY: cy = 0, boundingSphereCenterZ: cz = 0 } = header;
    const point = project
        ? project.projectPoint(geoPoint as GeoCoordinatesLike)
        : (geoPoint as THREE.Vector3);

    return new THREE.Vector3(point.x - cx, point.y - cy, point.z - cz);
}

export function toTileWorld(
    header: { boundingSphereCenterX?: number; boundingSphereCenterY?: number; boundingSphereCenterZ?: number },
    point: THREE.Vector3,
    project?: Projection
): GeoCoordinatesLike | THREE.Vector3 {
    const { boundingSphereCenterX: cx = 0, boundingSphereCenterY: cy = 0, boundingSphereCenterZ: cz = 0 } = header;

    const ppoint = new THREE.Vector3(point.x + cx, point.y + cy, point.z + cz);
    return project ? project.unprojectPoint(ppoint) : ppoint;
}

export function toTileLocalLines(
    header: { boundingSphereCenterX?: number; boundingSphereCenterY?: number; boundingSphereCenterZ?: number },
    lines: GeoCoordinatesLike[][] | THREE.Vector3[][],
    project?: Projection
): THREE.Vector3[][] {
    return lines.map(line => line.map(point => toTileLocal(header, point, project)));
}

export function toTileWorldLines(
    header: { boundingSphereCenterX?: number; boundingSphereCenterY?: number; boundingSphereCenterZ?: number },
    lines: THREE.Vector3[][],
    project?: Projection
): GeoCoordinatesLike[][] | THREE.Vector3[][] {
    return lines.map(line => line.map(point => toTileWorld(header, point, project))) as
        | GeoCoordinatesLike[][]
        | THREE.Vector3[][];
}

export function toTileWorldBBox(
    header: {
        boundingSphereCenterX?: number;
        boundingSphereCenterY?: number;
        boundingSphereCenterZ?: number;
    },
    bbox: THREE.Box3,
    project?: Projection
): GeoBox | THREE.Box3 {
    const { boundingSphereCenterX: cx = 0, boundingSphereCenterY: cy = 0, boundingSphereCenterZ: cz = 0 } = header;

    const min = new THREE.Vector3()
        .copy(bbox.min)
        .add(new THREE.Vector3(cx, cy, cz));
    const max = new THREE.Vector3()
        .copy(bbox.max)
        .add(new THREE.Vector3(cx, cy, cz));

    return project
        ? project.unprojectBox({
              min,
              max
          })
        : new THREE.Box3(min, max);
}

export function toTileLocalBBox(
    header: {
        boundingSphereCenterX?: number;
        boundingSphereCenterY?: number;
        boundingSphereCenterZ?: number;
    },
    bbox: GeoBox | THREE.Box3,
    project?: Projection
): THREE.Box3 {
    const { boundingSphereCenterX: cx = 0, boundingSphereCenterY: cy = 0, boundingSphereCenterZ: cz = 0 } = header;

    // 增加空值检查和后备方案
    const worldBox = project ? project.projectBox(bbox as GeoBox) : (bbox as THREE.Box3);

    // 增加浮点数精度处理
    const preciseOffset = (val: number, offset: number) => {
        const scaled = (val - offset) * 1e6;
        return Math.round(scaled) / 1e6;
    };

    return new THREE.Box3(
        new THREE.Vector3(
            preciseOffset(worldBox.min.x, cx),
            preciseOffset(worldBox.min.y, cy),
            preciseOffset(worldBox.min.z, cz)
        ),
        new THREE.Vector3(
            preciseOffset(worldBox.max.x, cx),
            preciseOffset(worldBox.max.y, cy),
            preciseOffset(worldBox.max.z, cz)
        )
    );
}
