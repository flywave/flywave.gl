import { flipPlane, Plane } from '../utils/plane';
import { flipPolygon, Polygon, splitPolygonByPlane } from './Polygon';

export interface BSPNode {
  readonly plane: Plane;
  readonly front?: BSPNode;
  readonly back?: BSPNode;
  readonly polygons: readonly Polygon[];
}

export const build = (polygons: readonly Polygon[], node?: BSPNode): BSPNode =>
  node
    ? buildFn(polygons, node)
    : buildFn(polygons, { plane: polygons[0].plane, polygons: [] });

export const buildFn = (
  polygons: readonly Polygon[],
  node: BSPNode
): BSPNode => {
  const split = polygons.reduce(
    (acc, polygon) => {
      const [
        coplanarFront,
        coplanarBack,
        frontSplit,
        backSplit
      ] = splitPolygonByPlane(node.plane, polygon);
      return {
        polygons: acc.polygons.concat(coplanarFront.concat(coplanarBack)),
        front: acc.front.concat(frontSplit),
        back: acc.back.concat(backSplit)
      };
    },
    {
      polygons: node.polygons,
      front: [] as readonly Polygon[],
      back: [] as readonly Polygon[]
    }
  );

  return {
    plane: node.plane,
    polygons: split.polygons,
    front: split.front.length > 0 ? build(split.front, node.front) : node.front,
    back: split.back.length > 0 ? build(split.back, node.back) : node.back
  };
};

export const fromPolygons = (polygons: readonly Polygon[]): BSPNode =>
  build(polygons);

export const allPolygons = (node: BSPNode): readonly Polygon[] =>
  node.polygons
    .concat(node.front ? allPolygons(node.front) : [])
    .concat(node.back ? allPolygons(node.back) : []);

export const clipPolygons = (
  node: BSPNode,
  polygons: readonly Polygon[]
): readonly Polygon[] => {
  const split = [...polygons].reduce(
    (acc, polygon) => {
      const [
        coplanarFront,
        coplanarBack,
        frontSplit,
        backSplit
      ] = splitPolygonByPlane(node.plane, polygon);
      return {
        front: acc.front.concat(coplanarFront).concat(frontSplit),
        back: acc.back.concat(coplanarBack).concat(backSplit)
      };
    },
    { front: [] as readonly Polygon[], back: [] as readonly Polygon[] }
  );

  return (node.front
    ? clipPolygons(node.front, split.front)
    : split.front
  ).concat(node.back ? clipPolygons(node.back, split.back) : []);
};

export const clipTo = (nodeA: BSPNode, nodeB: BSPNode): BSPNode => {
  const clippedPolygons = nodeB.plane
    ? clipPolygons(nodeB, nodeA.polygons)
    : nodeA.polygons;
  return {
    polygons: clippedPolygons,
    plane: nodeA.plane,
    front: nodeA.front ? clipTo(nodeA.front, nodeB) : undefined,
    back: nodeA.back ? clipTo(nodeA.back, nodeB) : undefined
  };
};

export const invert = (node: BSPNode): BSPNode => ({
  polygons: node.polygons.map(flipPolygon),
  plane: flipPlane(node.plane),
  front: node.back ? invert(node.back) : undefined,
  back: node.front ? invert(node.front) : undefined
});
