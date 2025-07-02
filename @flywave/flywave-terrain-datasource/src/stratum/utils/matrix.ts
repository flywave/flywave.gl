import { Vector } from './vector';

// Single level flatten
export const flatten = (x: ReadonlyArray<readonly any[]>): readonly any[] =>
  x.reduce((acc, y) => acc.concat(y), []);

export type Matrix = ReadonlyArray<ReadonlyArray<number>>;

export const transpose = (matrix: Matrix): Matrix =>
  Array(matrix[0].length)
    .fill(0)
    .map((__, colId) => matrix.map(row => row[colId]));

export const identityMatrixOf = (n: number) =>
  Array(n)
    .fill(0)
    .map((__, idx) =>
      Array(n)
        .fill(0)
        .map((___, idy) => (idx === idy ? 1 : 0))
    );

export const matmul = (matrixA: Matrix, matrixB: Matrix) =>
  new Array(matrixA.length)
    .fill(0)
    .map(__ => new Array(matrixB[0].length).fill(0))
    .map((row, i) =>
      row.map((__, j) =>
        matrixA[i].reduce((sum, elm, k) => sum + elm * matrixB[k][j], 0)
      )
    );

export const translate = (tx = 0, ty = 0, tz = 0): Matrix => [
  [1, 0, 0, tx],
  [0, 1, 0, ty],
  [0, 0, 1, tz],
  [0, 0, 0, 1]
];

export const scale = (sx = 0, sy = 0, sz = 0): Matrix => [
  [sx, 0, 0, 0],
  [0, sy, 0, 0],
  [0, 0, sz, 0],
  [0, 0, 0, 1]
];

export const rotateX = (theta: number): Matrix => [
  [1, 0, 0, 0],
  [0, Math.cos(theta), Math.sin(theta), 0],
  [0, -Math.sin(theta), Math.cos(theta), 0],
  [0, 0, 0, 1]
];

export const rotateY = (theta: number): Matrix => [
  [Math.cos(theta), 0, -Math.sin(theta), 0],
  [0, 1, 0, 0],
  [Math.sin(theta), 0, Math.cos(theta), 0],
  [0, 0, 0, 1]
];

export const rotateZ = (theta: number): Matrix => [
  [Math.cos(theta), -Math.sin(theta), 0, 0],
  [Math.sin(theta), Math.cos(theta), 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1]
];

export const vectorsToMatrix = (vectors: readonly Vector[]) =>
  transpose(vectors.map(vector => [vector.x, vector.y, vector.z, 1]));

export const orthographic = (
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
): Matrix => [
    [2 / (right - left), 0, 0, -(right + left) / (right - left)],
    [0, 2 / (top - bottom), 0, -(top + bottom) / (top - bottom)],
    [0, 0, -2 / (far - near), -(far + near) / (far - near)],
    [0, 0, 0, 1]
];
