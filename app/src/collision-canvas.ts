import type { Ellipse } from "../../src/core/footprint.js";
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { colliders } from "../../src/core/scene-collision.js";

function newCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

function drawEllipse(ctx: CanvasRenderingContext2D, e: Ellipse, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Black/white collision mask PNG (white = blocked). */
export async function collisionMaskBlob(store: Store, lib: LoadedLibrary): Promise<Blob> {
  const { mapW, mapH, placements } = store.state;
  const { c, ctx } = newCanvas(mapW, mapH);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, mapW, mapH);
  for (const e of colliders(placements, lib.lookup)) drawEllipse(ctx, e, "#fff");
  return await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("canvas toBlob returned null"))), "image/png"));
}

/** Composited map PNG: base map + all placed assets flattened. */
export async function compositeBlob(store: Store, lib: LoadedLibrary): Promise<Blob> {
  const { mapW, mapH, baseMapDataUrl, placements } = store.state;
  const { c, ctx } = newCanvas(mapW, mapH);
  if (baseMapDataUrl) {
    const base = new Image();
    base.src = baseMapDataUrl;
    await base.decode();
    ctx.drawImage(base, 0, 0, mapW, mapH);
  }
  const sorted = [...placements].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    const e = lib.entry(p.assetId);
    const img = new Image();
    img.src = `/assets/${e.file}`;
    await img.decode();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, p.x - e.w / 2, p.y - e.h, e.w, e.h);
  }
  return await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("canvas toBlob returned null"))), "image/png"));
}
