import { cross, dot, minus, negated, unit, Vector } from './vector';

export interface Plane {
  readonly normal: Vector;
  readonly w: number;
}

export const PlaneEpsilon = 1e-5;

export const fromVectors = (vectors: readonly Vector[]): Plane => {
  const [a, b, c] = vectors;
  const normal = unit(cross(minus(b, a), minus(c, a)));
  return {
    normal,
    w: dot(normal, a)
  };
};

export const flipPlane = (plane: Plane): Plane => ({
  normal: negated(plane.normal),
  w: -1 * plane.w
});
