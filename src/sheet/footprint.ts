// Pure, Node-free: safe to bundle into the browser (no sharp/fs imports).
export type Rect = { x: number; y: number; w: number; h: number };
export type Ellipse = { cx: number; cy: number; rx: number; ry: number };

/**
 * Base-footprint ellipse at an object's feet (bottom-center). Height is
 * `footprint` × the rect height; width spans the rect. footprint 1.0 fills the
 * rect (flat props like water); small footprints sit at the base (tall props).
 */
export function footprintEllipse(rect: Rect, footprint: number): Ellipse {
  const rx = rect.w / 2;
  const ry = Math.max(1, (rect.h * footprint) / 2);
  return { cx: rect.x + rx, cy: rect.y + rect.h - ry, rx, ry };
}
export function pointInEllipse(e: Ellipse, x: number, y: number): boolean {
  const nx = (x - e.cx) / e.rx;
  const ny = (y - e.cy) / e.ry;
  return nx * nx + ny * ny <= 1;
}
