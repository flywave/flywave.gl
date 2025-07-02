import { createPolygon, Polygon } from './polygon';
import { Vector } from '../utils/vector';

export const createCube = (options?: {
  readonly center?: Vector;
  readonly radius?: Vector;
}): readonly Polygon[] => {
  const c: Vector = (options && options.center) || { x: 0, y: 0, z: 0 };
  const r: Vector = (options && options.radius) || { x: 1, y: 1, z: 1 };
  return [
    { positions: [0, 4, 6, 2] },
    { positions: [1, 3, 7, 5] },
    { positions: [0, 1, 5, 4] },
    { positions: [2, 6, 7, 3] },
    { positions: [0, 2, 3, 1] },
    { positions: [4, 5, 7, 6] }
  ].map(({ positions }) =>
    createPolygon(
      positions.map(i => ({
        x: !!(i & 1) ? c.x + r.x : c.x + r.x * -1,
        y: !!(i & 2) ? c.y + r.y : c.y + r.y * -1,
        z: !!(i & 4) ? c.z + r.z : c.z + r.z * -1
      }))
    )
  );
};
