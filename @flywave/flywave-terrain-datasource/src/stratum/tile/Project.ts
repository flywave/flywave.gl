import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import * as THREE from 'three';

export function toTileLocal(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    point: THREE.Vector3
): THREE.Vector3 {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;
    return new THREE.Vector3(
        point.x - centerX,
        point.y - centerY,
        point.z - centerZ
    );
}

export function toTileWorld(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    point: THREE.Vector3
): THREE.Vector3 {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;
    return new THREE.Vector3(
        point.x + centerX,
        point.y + centerY,
        point.z + centerZ
    );
}

export function toTileLocalLines(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    lines: THREE.Vector3[][]
): THREE.Vector3[][] {
    return lines.map(line => 
        line.map(point => toTileLocal(header, point))
    );
}

export function toTileWorldLines(
    header: { centerX?: number; centerY?: number; centerZ?: number },
    lines: THREE.Vector3[][]
): THREE.Vector3[][] {
    return lines.map(line => 
        line.map(point => toTileWorld(header, point))
    );
}

export function toTileWorldBBox(
    header: {
        centerX?: number;
        centerY?: number;
        centerZ?: number;
    },
    bbox: THREE.Box3
): GeoBox {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;
    
    const min = new THREE.Vector3().copy(bbox.min).addScalar(centerX, centerY, centerZ);
    const max = new THREE.Vector3().copy(bbox.max).addScalar(centerX, centerY, centerZ);

    return new GeoBox(
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
    bbox: GeoBox
): THREE.Box3 {
    const { centerX = 0, centerY = 0, centerZ = 0 } = header;
    
    const sw = bbox.southWest;
    const ne = bbox.northEast;
    
    return new THREE.Box3(
        new THREE.Vector3(
            sw.longitude - centerX,
            sw.latitude - centerY,
            (sw.altitude || 0) - centerZ
        ),
        new THREE.Vector3(
            ne.longitude - centerX,
            ne.latitude - centerY,
            (ne.altitude || 0) - centerZ
        )
    );
}