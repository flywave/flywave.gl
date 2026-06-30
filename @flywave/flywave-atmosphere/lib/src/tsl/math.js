// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
// TSL shader expressions use operator chaining (sub(), dot(), .pow(), etc.)
// through runtime proxies that @types/three@0.184 cannot fully type.
// This file contains pure shader logic analogous to GLSL string content;
// type safety is enforced at the exported function boundary by FnVar.
import { dot, If, sqrt, struct, sub, vec2 } from "three/tsl";
import { FnVar } from "./FnVar";
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
export const raySphereIntersection = FnVar(
/* eslint-disable @typescript-eslint/no-explicit-any */
(rayOrigin, rayDirection, center, radius) => {
    const a = sub(rayOrigin, center);
    const b = dot(rayDirection, a);
    const c = dot(a, a).sub(radius.pow(2));
    const discriminant = b.pow(2).sub(c).toConst();
    const intersection = vec2(-1);
    If(discriminant.greaterThanEqual(0), () => {
        const Q = sqrt(discriminant);
        intersection.assign(vec2(b.negate().sub(Q), b.negate().add(Q)));
    });
    return intersection;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
);
/**
 * Computes the intersection distances of a ray with an ellipsoid defined by
 * its three semi-axis radii.
 *
 * @param rayOrigin - vec3: ray origin position
 * @param rayDirection - vec3: normalized ray direction
 * @param radii - vec3: ellipsoid semi-axis radii (x, y, z)
 * @returns vec2(near, far) intersection distances, or vec2(-1) if no hit.
 */
export const rayEllipsoidIntersection = FnVar(
/* eslint-disable @typescript-eslint/no-explicit-any */
(rayOrigin, rayDirection, radii) => {
    const ro = rayOrigin.div(radii);
    const rd = rayDirection.div(radii);
    const a = dot(rd, rd);
    const b = dot(ro, rd);
    const c = dot(ro, ro).sub(1);
    const discriminant = b.pow(2).sub(a.mul(c)).toConst();
    const intersections = vec2(-1);
    If(discriminant.greaterThanEqual(0), () => {
        const Q = sqrt(discriminant);
        intersections.assign(vec2(b.negate().sub(Q), b.negate().add(Q)).div(a));
    });
    return intersections;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
);
export const raySpheresIntersectionsStruct = /*#__PURE__*/ struct({
    near: "vec4",
    far: "vec4"
});
export const raySpheresIntersections = FnVar(
/* eslint-disable @typescript-eslint/no-explicit-any */
(rayOrigin, rayDirection, center, radii) => {
    const a = rayOrigin.sub(center);
    const b = dot(rayDirection, a);
    const c = dot(a, a).sub(radii.pow(2));
    const discriminant = b.pow(2).sub(c).toConst();
    const mask = vec2(discriminant.greaterThanEqual(0)).toConst();
    const inverseMask = mask.oneMinus().toConst();
    const Q = sqrt(discriminant.max(0)).toConst();
    const near = mask.mul(b.negate().sub(Q)).sub(inverseMask);
    const far = mask.mul(b.negate().add(Q)).sub(inverseMask);
    return raySpheresIntersectionsStruct(near, far);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
);
//# sourceMappingURL=math.js.map