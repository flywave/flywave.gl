import { createPolygon } from './polygon';

export const createSquare = () => [
  createPolygon([
    { x: -0.5, y: 0.5, z: 0.0 },
    { x: -0.5, y: -0.5, z: 0.0 },
    { x: 0.5, y: -0.5, z: 0.0 },
    { x: 0.5, y: 0.5, z: 0.0 }
  ])
];
