import type { TileCoord } from "./types.js";

const C = 0.5; // tile-center offset

export function tileInRect(tx: number, ty: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
}

/** Ray-casting point-in-polygon on the tile center (tx+0.5, ty+0.5). */
export function tileInPolygon(tx: number, ty: number, points: TileCoord[]): boolean {
  const px = tx + C, py = ty + C;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function tileInEllipse(tx: number, ty: number, e: { cx: number; cy: number; rx: number; ry: number }): boolean {
  const px = tx + C, py = ty + C;
  const nx = (px - e.cx) / e.rx;
  const ny = (py - e.cy) / e.ry;
  return nx * nx + ny * ny <= 1;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Tile center within `width/2 + 0.55` of any polyline segment → continuous strip. */
export function tileInPolylineBuffer(tx: number, ty: number, points: TileCoord[], width: number): boolean {
  const px = tx + C, py = ty + C;
  const radius = width / 2 + 0.55;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    if (distToSegment(px, py, ax + C, ay + C, bx + C, by + C) <= radius) return true;
  }
  return false;
}
