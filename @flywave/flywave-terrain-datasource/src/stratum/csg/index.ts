import { allPolygons, build, clipTo, fromPolygons, invert } from './bsp';
import { flipPolygon, Polygon } from './polygon';

export const union = (
  a: readonly Polygon[],
  b: readonly Polygon[]
): readonly Polygon[] => {
  const bspA = fromPolygons(a);
  const bspB = fromPolygons(b);
  const clippedA = clipTo(bspA, bspB);
  const clippedB = invert(clipTo(invert(clipTo(bspB, clippedA)), clippedA));
  return allPolygons(build(allPolygons(clippedB), clippedA));
};

export const subtract = (
  a: readonly Polygon[],
  b: readonly Polygon[]
): readonly Polygon[] => {
  const bspA = fromPolygons(a);
  const bspB = fromPolygons(b);
  const clippedA = clipTo(invert(bspA), bspB);
  const clippedB = invert(clipTo(invert(clipTo(bspB, clippedA)), clippedA));
  return allPolygons(invert(build(allPolygons(clippedB), clippedA)));
};

export const inverse = (a: readonly Polygon[]) => a.map(flipPolygon);
