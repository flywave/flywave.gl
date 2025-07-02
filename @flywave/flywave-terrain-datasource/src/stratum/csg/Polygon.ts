import { flipPlane, fromVectors, Plane, PlaneEpsilon } from '../utils/plane';
import { dot, interpolate, minus, Vector } from '../utils/vector';

export interface Polygon {
  readonly vectors: readonly Vector[];
  readonly plane: Plane;
}

export const createPolygon = (vectors: readonly Vector[]): Polygon => ({
  vectors,
  plane: fromVectors(vectors)
});

export const flipPolygon = (polygon: Polygon): Polygon => ({
  vectors: [...polygon.vectors].reverse(),
  plane: flipPlane(polygon.plane)
});

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

export const splitType = (
  plane: Plane,
  polygon: Polygon
): { readonly types: readonly number[]; readonly polygonType: number } =>
  polygon.vectors.reduce(
    (acc, vector) => {
      const t = dot(plane.normal, vector) - plane.w;
      const type =
        t < -PlaneEpsilon ? BACK : t > PlaneEpsilon ? FRONT : COPLANAR;
      return {
        polygonType: acc.polygonType | type,
        types: acc.types.concat(type)
      };
    },
    {
      types: [] as readonly number[],
      polygonType: 0
    }
  );

const splitCoplanar = (
  plane: Plane,
  polygon: Polygon
): ReadonlyArray<readonly Polygon[]> => {
  const d = dot(plane.normal, polygon.plane.normal);
  return d > 0 ? [[polygon], [], [], []] : [[], [polygon], [], []];
};

const splitSpanning = (
  plane: Plane,
  polygon: Polygon,
  types: readonly number[]
): ReadonlyArray<readonly Polygon[]> => {
  const { f, b } = polygon.vectors.reduce(
    (acc, vector, idx) => {
      const nextIdx = (idx + 1) % polygon.vectors.length; // Cyclical next
      const nextVector = polygon.vectors[nextIdx];
      const span = (types[idx] | types[nextIdx]) === SPANNING;
      const accc = {
        f: types[idx] !== BACK ? [...acc.f, vector] : acc.f,
        b: types[idx] !== FRONT ? [...acc.b, vector] : acc.b
      };
      const tt =
        (plane.w - dot(plane.normal, vector)) /
        dot(plane.normal, minus(nextVector, vector));
      const v = interpolate(vector, nextVector, tt);
      return span ? { f: [...accc.f, v], b: [...accc.b, v] } : accc;
    },
    { f: [] as readonly Vector[], b: [] as readonly Vector[] }
  );
  return [
    [],
    [],
    f.length >= 3 ? [createPolygon(f)] : [],
    b.length >= 3 ? [createPolygon(b)] : []
  ];
};

export const splitPolygonByPlane = (
  plane: Plane,
  polygon: Polygon
): ReadonlyArray<readonly Polygon[]> => {
  const { types, polygonType } = splitType(plane, polygon);
  return polygonType === COPLANAR
    ? splitCoplanar(plane, polygon)
    : polygonType === FRONT
      ? [[], [], [polygon], []]
      : polygonType === BACK
        ? [[], [], [], [polygon]]
        : splitSpanning(plane, polygon, types);
};
