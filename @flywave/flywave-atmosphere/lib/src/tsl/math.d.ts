import type { Node } from "./node";
/**
 * Computes the intersection distances of a ray with a sphere.
 *
 * @param rayOrigin - vec3: ray origin position
 * @param rayDirection - vec3: normalized ray direction
 * @param center - vec3: sphere center position
 * @param radius - float: sphere radius
 * @returns vec2(near, far) intersection distances, or vec2(-1) if no hit.
 *
 * Reference: https://iquilezles.org/articles/intersectors/
 */
export declare const raySphereIntersection: (rayOrigin: any, rayDirection: any, center: any, radius: any) => Node;
/**
 * Computes the intersection distances of a ray with an ellipsoid defined by
 * its three semi-axis radii.
 *
 * @param rayOrigin - vec3: ray origin position
 * @param rayDirection - vec3: normalized ray direction
 * @param radii - vec3: ellipsoid semi-axis radii (x, y, z)
 * @returns vec2(near, far) intersection distances, or vec2(-1) if no hit.
 */
export declare const rayEllipsoidIntersection: (rayOrigin: any, rayDirection: any, radii: any) => Node;
export declare const raySpheresIntersectionsStruct: import("three/src/nodes/TSL.js").Struct;
export declare const raySpheresIntersections: (rayOrigin: any, rayDirection: any, center: any, radii: any) => Node;
