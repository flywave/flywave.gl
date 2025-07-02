import { createPolygon, flipPolygon, Polygon } from './Polygon';
import { Matrix, matmul, transpose, translate, vectorsToMatrix } from '../utils/matrix';

export const transform = (
  polygons: readonly Polygon[],
  tmatrix: Matrix
): readonly Polygon[] =>
  polygons.map(polygon =>
    createPolygon(
      transpose(matmul(tmatrix, vectorsToMatrix(polygon.vectors))).map(row => ({
        x: row[0],
        y: row[1],
        z: row[2]
      }))
    )
  );

export const simpleExtrude = (
  polygon: Polygon,
  height: number
): readonly Polygon[] => {
  const top = flipPolygon(polygon);
  const bottom = transform([polygon], translate(0, 0, height))[0];
  const walls = top.vectors.reduce((acc, __, idx) => {
    const nextIdx = (idx + 1) % top.vectors.length; // Cyclical next
    return [
      ...acc,
      createPolygon([
        [...bottom.vectors].reverse()[idx],
        [...bottom.vectors].reverse()[nextIdx],
        top.vectors[nextIdx],
        top.vectors[idx]
      ])
    ];
  }, [] as readonly Polygon[]);
  return [top, ...walls, bottom];
};
