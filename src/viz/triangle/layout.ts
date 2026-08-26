export type Vec = { x: number; y: number };

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}
export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}
export function scale(a: Vec, s: number): Vec {
  return { x: a.x * s, y: a.y * s };
}
export function len(a: Vec) {
  return Math.hypot(a.x, a.y);
}
export function norm(a: Vec): Vec {
  const L = len(a) || 1;
  return { x: a.x / L, y: a.y / L };
}
export function rot90(a: Vec): Vec {
  return { x: -a.y, y: a.x };
}

export type TriangleFrame = {
  A: Vec;
  B: Vec;
  C: Vec;
  sides: {
    left: SideFrame;
    right: SideFrame;
    bottom: SideFrame;
  };
};

export type SideFrame = {
  p0: Vec;
  p1: Vec;
  mid: Vec;
  tangent: Vec;
  outward: Vec;
  length: number;
};

/**
 * Equilateral triangle, vertex up. Outward normals:
 * left → northwest, right → northeast, bottom → south.
 */
export function layoutTriangle(cx: number, cy: number, size: number): TriangleFrame {
  const side = size;
  const h = (Math.sqrt(3) / 2) * side;
  const A = { x: cx, y: cy - (2 / 3) * h };
  const B = { x: cx - side / 2, y: cy + (1 / 3) * h };
  const C = { x: cx + side / 2, y: cy + (1 / 3) * h };

  const make = (p0: Vec, p1: Vec): SideFrame => {
    const tangent = norm(sub(p1, p0));
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    let outward = rot90(tangent);
    const toCentroid = { x: cx - mid.x, y: cy - mid.y };
    if (outward.x * toCentroid.x + outward.y * toCentroid.y > 0) {
      outward = { x: -outward.x, y: -outward.y };
    }
    return { p0, p1, mid, tangent, outward, length: len(sub(p1, p0)) };
  };

  return {
    A,
    B,
    C,
    sides: {
      left: make(A, B),
      right: make(C, A),
      bottom: make(B, C),
    },
  };
}
