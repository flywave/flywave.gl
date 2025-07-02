export interface Vector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly metadata?: any;
}

export const negated = (a: Vector): Vector => ({
  x: -1 * a.x,
  y: -1 * a.y,
  z: -1 * a.z,
  metadata: a.metadata
});

export const plus = (a: Vector, b: Vector): Vector => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
  metadata: a.metadata
});

export const minus = (a: Vector, b: Vector): Vector => plus(a, negated(b));

export const times = (a: Vector, n: number): Vector => ({
  x: a.x * n,
  y: a.y * n,
  z: a.z * n,
  metadata: a.metadata
});

export const normalize = (a: Vector): Vector => dividedBy(a, lengthV(a));

export const dividedBy = (a: Vector, n: number): Vector => ({
  x: a.x / n,
  y: a.y / n,
  z: a.z / n,
  metadata: a.metadata
});

export const dot = (a: Vector, b: Vector): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

export const lerp = (a: Vector, b: Vector, t: number) =>
  plus(a, times(minus(b, a), t));

export const lengthV = (a: Vector): number => Math.sqrt(dot(a, a));

export const unit = (a: Vector) => dividedBy(a, lengthV(a));

export const cross = (a: Vector, b: Vector): Vector => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
  metadata: a.metadata
});

export const interpolate = (v1: Vector, v2: Vector, t: number) => lerp(v1, v2, t);

export const fromRow = (row: readonly number[]): Vector => ({ x: row[0], y: row[1], z: row[2] });

// 新增二维向量类型
export interface Vector2D {
  readonly x: number;
  readonly y: number;
  readonly metadata?: any;
}

// 二维向量运算函数
export const plus2D = (a: Vector2D, b: Vector2D): Vector2D => ({
  x: a.x + b.x,
  y: a.y + b.y,
  metadata: a.metadata
});

export const minus2D = (a: Vector2D, b: Vector2D): Vector2D => 
  plus2D(a, { x: -b.x, y: -b.y });

export const times2D = (a: Vector2D, n: number): Vector2D => ({
  x: a.x * n,
  y: a.y * n,
  metadata: a.metadata
});

export const dot2D = (a: Vector2D, b: Vector2D): number =>
  a.x * b.x + a.y * b.y;

export const length2D = (a: Vector2D): number => 
  Math.sqrt(dot2D(a, a));

export const normalize2D = (a: Vector2D): Vector2D => {
  const len = length2D(a);
  return len > 1e-6 ? { x: a.x/len, y: a.y/len } : a;
};

// 二维叉积（返回标量值）
export const cross2D = (a: Vector2D, b: Vector2D): number =>
  a.x * b.y - a.y * b.x;

// 二维点距离计算
export const distance2D = (a: Vector2D, b: Vector2D): number =>
  length2D(minus2D(a, b));

// 二维插值函数
export const lerp2D = (a: Vector2D, b: Vector2D, t: number): Vector2D => 
  plus2D(a, times2D(minus2D(b, a), t));

// 从数组创建二维向量
export const fromRow2D = (row: readonly number[]): Vector2D => 
  ({ x: row[0], y: row[1] });