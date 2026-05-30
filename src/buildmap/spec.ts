import { z } from "zod";
import type { Rect } from "../core/footprint.js";

// ---- spec schema -----------------------------------------------------------
const FeatureSchema = z.object({
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [x, y, w, h]
  prompt: z.string().min(1),
  collides: z.boolean().optional().default(true),
  /** Inpaint text-guidance strength; higher = more literal object. Default 8. */
  guidance: z.number().optional(),
  /** Fraction of the object's HEIGHT (from the bottom) that is solid — the base
   * footprint. 0.4 suits tall props (tree trunk/rock base, walk behind the top);
   * use 1.0 for flat props like water that block fully. */
  footprint: z.number().min(0.05).max(1).optional().default(0.4),
});
export const SpecSchema = z.object({
  base: z.string().min(1), // base terrain prompt, e.g. "flat green grass field, top-down"
  size: z.number().int().min(16).max(400).optional().default(256), // pixflux range
  seed: z.number().int().optional(),
  /** Short background phrase appended to inpaint prompts so the box fills correctly. */
  background: z.string().optional().default("green grass"),
  features: z.array(FeatureSchema).max(20).default([]),
});
export type Spec = z.infer<typeof SpecSchema>;

export type Mode = "sprite" | "inpaint";

export type ObjPlace = { spriteB64: string; x: number; y: number; w: number; h: number; shadow: boolean };
export type BuiltMap = { mapB64: string; collisionB64: string; objects: ObjPlace[] };

/** Tiny stable hash so an unchanged (spec, mode) reuses the cached map (no credits). */
export function hashSpec(spec: Spec, mode: Mode): string {
  const s = JSON.stringify({ spec, mode });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export function rectOf(f: Spec["features"][number], size: number): Rect {
  const [x, y, w, h] = f.rect;
  const cx = Math.max(0, Math.min(size, Math.round(x)));
  const cy = Math.max(0, Math.min(size, Math.round(y)));
  return { x: cx, y: cy, w: Math.max(1, Math.min(size - cx, Math.round(w))), h: Math.max(1, Math.min(size - cy, Math.round(h))) };
}
