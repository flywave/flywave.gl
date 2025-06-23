import { Vector3, Spherical, Vector3Like } from 'three';

/**
 * Converts between Cesium/3D Tiles and Three.js coordinate frames:
 * 
 * Cesium/3D Tiles Frame:
 * - Up is Z at 90° latitude
 * - 0,0 lat/lon is along X axis
 *      Z
 *      |
 *      |
 *      .----- Y
 *     /
 *   X
 * 
 * Three.js Frame:
 * - Up is Y at 90° latitude 
 * - 0,0 lat/lon is along Z axis
 *       Y
 *      |
 *      |
 *      .----- X
 *     /
 *   Z
 */

/**
 * Swaps coordinate frames between Cesium and Three.js
 * @param target Vector to transform (modified in place)
 */
function swapFrame(target: Vector3Like): void {
    const { x, y, z } = target;
    (target as any).x = z;
    (target as any).y = x; 
    (target as any).z = y;
}

/**
 * Converts spherical phi angle to geographic latitude
 * @param phi Spherical phi angle in radians
 * @returns Geographic latitude in radians
 */
export function sphericalPhiToLatitude(phi: number): number {
    return -(phi - Math.PI / 2);
}

/**
 * Converts geographic latitude to spherical phi angle 
 * @param latitude Geographic latitude in radians
 * @returns Spherical phi angle in radians
 */
export function latitudeToSphericalPhi(latitude: number): number {
    return -latitude + Math.PI / 2;
}

// Reusable worker objects to avoid allocations
const _spherical = new Spherical();
const _norm = new Vector3(); 
const _vec = new Vector3();

export class Ellipsoid {
    public radius: Vector3;

    /**
     * Creates an ellipsoid with the given radii
     * @param x Radius along X axis (default: 1)
     * @param y Radius along Y axis (default: 1) 
     * @param z Radius along Z axis (default: 1)
     */
    constructor(x: number = 1, y: number = 1, z: number = 1) {
        this.radius = new Vector3(x, y, z);
    }

    /**
     * Converts geographic coordinates to 3D position
     * @param lat Latitude in radians
     * @param lon Longitude in radians
     * @param height Height above surface
     * @param target Target vector to store result
     * @returns Position vector in 3D space
     */
    getCartographicToPosition(lat: number, lon: number, height: number, target: Vector3): Vector3 {
        // Implementation based on Cesium's Ellipsoid implementation:
        // https://github.com/CesiumGS/cesium/blob/main/Source/Core/Ellipsoid.js#L396
        
        const radius = this.radius;
        
        // Convert to spherical coordinates
        _spherical.set(1, latitudeToSphericalPhi(lat), lon);
        _norm.setFromSpherical(_spherical).normalize();
        
        // Convert between coordinate frames
        swapFrame(_norm);
        
        // Scale by squared radii
        _vec.copy(_norm);
        _vec.x *= radius.x ** 2;
        _vec.y *= radius.y ** 2;
        _vec.z *= radius.z ** 2;
        
        // Compute surface normal
        const gamma = Math.sqrt(_norm.dot(_vec));
        _vec.divideScalar(gamma);
        
        // Add height offset
        return target.copy(_vec).addScaledVector(_norm, height);
    }

    /**
     * Gets surface normal at given geographic coordinates
     * @param lat Latitude in radians
     * @param lon Longitude in radians
     * @param target Target vector to store result
     * @returns Normal vector at surface
     */
    getCartographicToNormal(lat: number, lon: number, target: Vector3): Vector3 {
        _spherical.set(1, (-lat + Math.PI / 2), lon);
        target.setFromSpherical(_spherical).normalize();
        swapFrame(target);
        return target;
    }

    /**
     * Gets surface normal at given 3D position
     * @param pos Position in 3D space
     * @param target Target vector to store result
     * @returns Normal vector at position
     */
    getPositionToNormal(pos: Vector3, target: Vector3): Vector3 {
        const radius = this.radius;
        target.copy(pos);
        target.x /= radius.x ** 2;
        target.y /= radius.y ** 2;
        target.z /= radius.z ** 2;
        target.normalize();
        return target;
    }
}