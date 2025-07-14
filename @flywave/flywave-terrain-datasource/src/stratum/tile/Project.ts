import { GeoBox, GeoCoordinates, GeoCoordinatesLike, Projection } from "@flywave/flywave-geoutils";
import * as THREE from "three";

export function toTileLocal(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    geoPoint: GeoCoordinatesLike,
    project?: Projection
): THREE.Vector3 {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;
    const point = project
        ? project.projectPoint(geoPoint)
        : new THREE.Vector3(geoPoint.longitude, geoPoint.latitude, geoPoint.altitude);

    return new THREE.Vector3(point.x - centerX, point.y - centerY, point.z - centerZ);
}

export function toTileWorld(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    point: THREE.Vector3,
    project?: Projection
): GeoCoordinatesLike | THREE.Vector3 {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;

    const ppoint = new THREE.Vector3(point.x + centerX, point.y + centerY, point.z + centerZ);
    return project ? project.unprojectPoint(ppoint) : ppoint;
}

export function toTileLocalLines(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    lines: GeoCoordinatesLike[][],
    project?: Projection
): THREE.Vector3[][] {
    return lines.map(line => line.map(point => toTileLocal(header, point, project)));
}

export function toTileWorldLines(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    lines: THREE.Vector3[][],
    project?: Projection
): GeoCoordinatesLike[][] | THREE.Vector3[][] {
    return lines.map(line => line.map(point => toTileWorld(header, point, project))) as
        | GeoCoordinatesLike[][]
        | THREE.Vector3[][];
}

export function toTileWorldBBox(
    header: {
        centerX?: number;
        centerY?: number;
        centerZ?: number;
    },
    bbox: THREE.Box3,
    project?: Projection
): GeoBox {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;

    const min = new THREE.Vector3()
        .copy(bbox.min)
        .add(new THREE.Vector3(centerX, centerY, centerZ));
    const max = new THREE.Vector3()
        .copy(bbox.max)
        .add(new THREE.Vector3(centerX, centerY, centerZ));

    return project
        ? project.unprojectBox({
              min,
              max
          })
        : new GeoBox(
              new GeoCoordinates(min.y, min.x, min.z),
              new GeoCoordinates(max.y, max.x, max.z)
          );
}

export function toTileLocalBBox(
    header: {
        centerX?: number;
        centerY?: number;
        centerZ?: number;
    },
    bbox: GeoBox,
    project?: Projection
): THREE.Box3 {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;

    // 增加空值检查和后备方案
    const worldBox = project
        ? project.projectBox(bbox)
        : (() => {
              return {
                  min: {
                      x: bbox.west,
                      y: bbox.south,
                      z: bbox.minAltitude
                  },
                  max: {
                      x: bbox.east,
                      y: bbox.north,
                      z: bbox.maxAltitude
                  }
              };
          })();

    // 增加浮点数精度处理
    const preciseOffset = (val: number, offset: number) => {
        const scaled = (val - offset) * 1e6;
        return Math.round(scaled) / 1e6;
    };

    return new THREE.Box3(
        new THREE.Vector3(
            preciseOffset(worldBox.min.x, centerX),
            preciseOffset(worldBox.min.y, centerY),
            preciseOffset(worldBox.min.z, centerZ)
        ),
        new THREE.Vector3(
            preciseOffset(worldBox.max.x, centerX),
            preciseOffset(worldBox.max.y, centerY),
            preciseOffset(worldBox.max.z, centerZ)
        )
    );
}
