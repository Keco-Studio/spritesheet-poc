import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { z } from "zod";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateMap } from "./pixellab/map.js";
import { generateObject } from "./pixellab/object.js";
import { inpaint } from "./pixellab/inpaint.js";
import { rectsToMaskPng, type Rect } from "./sheet/mask.js";
import { footprintEllipse } from "./sheet/footprint.js";
import { removeFlatBackground } from "./sheet/transparency.js";
import { emitGame, type ObjectPlacement } from "./game/emit.js";
import type { Manifest } from "./types.js";

// ---- spec schema -----------------------------------------------------------
const FeatureSchema = z.object({
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [x, y, w, h]
  prompt: z.string().min(1),
  collides: z.boolean().optional().default(true),
  /** Inpaint text-guidance strength; higher = more literal object. Default 7. */
  guidance: z.number().optional(),
  /** Fraction of the object's HEIGHT (from the bottom) that is solid — the base
   * footprint. 0.4 suits tall props (tree trunk/rock base, walk behind the top);
   * use 1.0 for flat props like water that block fully. */
  footprint: z.number().min(0.05).max(1).optional().default(0.4),
});
const SpecSchema = z.object({
  base: z.string().min(1), // base terrain prompt, e.g. "flat green grass field, top-down"
  size: z.number().int().min(16).max(400).optional().default(256), // pixflux range
  seed: z.number().int().optional(),
  /** Short background phrase appended to inpaint prompts so the box fills correctly. */
  background: z.string().optional().default("green grass"),
  features: z.array(FeatureSchema).max(20).default([]),
});
type Spec = z.infer<typeof SpecSchema>;

type Mode = "sprite" | "inpaint";
type Args = { specPath: string; characterDir: string; outDir: string; open: boolean; mode: Mode };

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let specPath: string | undefined;
  let characterDir = "./output/knight";
  let outDir = "./output/buildmap";
  let open = false;
  let mode: Mode = "sprite";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--character") characterDir = args[++i];
    else if (a === "--out") outDir = args[++i];
    else if (a === "--mode") {
      const m = args[++i];
      if (m !== "sprite" && m !== "inpaint") die('--mode must be "sprite" or "inpaint"');
      mode = m;
    } else if (a === "--open") open = true;
    else if (!a.startsWith("--")) specPath = a;
    else die(`unknown arg: ${a}`);
  }
  if (!specPath) {
    die("usage: buildmap <spec.json> [--mode sprite|inpaint] [--character DIR] [--out DIR] [--open]");
  }
  return { specPath, characterDir, outDir, open, mode };
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Tiny stable hash so an unchanged (spec, mode) reuses the cached map (no credits). */
function hashSpec(spec: Spec, mode: Mode): string {
  const s = JSON.stringify({ spec, mode });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function rectOf(f: Spec["features"][number], size: number): Rect {
  const [x, y, w, h] = f.rect;
  const cx = Math.max(0, Math.min(size, Math.round(x)));
  const cy = Math.max(0, Math.min(size, Math.round(y)));
  return { x: cx, y: cy, w: Math.max(1, Math.min(size - cx, Math.round(w))), h: Math.max(1, Math.min(size - cy, Math.round(h))) };
}

function loadCharacter(dir: string): { pngPath: string; manifest: Manifest } {
  const charDir = resolve(dir);
  const pngPath = join(charDir, "spritesheet.png");
  const manifestPath = join(charDir, "spritesheet.json");
  if (!existsSync(pngPath) || !existsSync(manifestPath)) {
    die(`character not found in ${charDir} (need spritesheet.png + spritesheet.json).`);
  }
  return { pngPath, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest };
}

type ObjPlace = { spriteB64: string; x: number; y: number; w: number; h: number; shadow: boolean };
type BuiltMap = { mapB64: string; collisionB64: string; objects: ObjPlace[] };

/**
 * Stamp an object's BASE FOOTPRINT into the collision buffer as a solid ELLIPSE
 * at the object's feet (bottom-center). Height = `footprint` × the object's
 * height, width = the object's width. This is the classic top-down "feet
 * collider": guaranteed present (unlike a thin trunk's alpha), tight (not the
 * whole box), and a clean full ellipse for flat props (footprint 1.0 = pond).
 * Combined with y-sort, the character collides with the base but walks behind
 * the upper part (tree canopy).
 */
/**
 * Crop a sprite to its non-transparent content. Generated sprites often have
 * transparent padding inside their frame, so the frame's bottom ≠ the object's
 * visual base. Trimming makes the placement rect match the real object, so
 * collision, y-sort feet, and the contact shadow all align to what you see.
 */
async function trimToContent(
  spritePng: Buffer,
  w: number,
  h: number,
): Promise<{ png: Buffer; dx: number; dy: number; w: number; h: number }> {
  const { data } = await sharp(spritePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return { png: spritePng, dx: 0, dy: 0, w, h }; // fully transparent: leave as-is
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const png = await sharp(spritePng).extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer();
  return { png, dx: x0, dy: y0, w: cw, h: ch };
}

function stampFootprint(collision: Uint8Array, size: number, rect: Rect, footprint: number): void {
  const e = footprintEllipse(rect, footprint);
  const y0 = Math.max(0, Math.floor(e.cy - e.ry));
  const y1 = Math.min(size - 1, Math.ceil(e.cy + e.ry));
  const x0 = Math.max(0, Math.floor(e.cx - e.rx));
  const x1 = Math.min(size - 1, Math.ceil(e.cx + e.rx));
  for (let my = y0; my <= y1; my++) {
    for (let mx = x0; mx <= x1; mx++) {
      const nx = (mx + 0.5 - e.cx) / e.rx, ny = (my + 0.5 - e.cy) / e.ry;
      if (nx * nx + ny * ny <= 1) collision[my * size + mx] = 255;
    }
  }
}

/** Turn a size×size 0/255 buffer into a black/white PNG (white = blocked). */
function collisionToPng(collision: Uint8Array, size: number): Promise<Buffer> {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = collision[i];
    rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  return sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

type Client = ReturnType<typeof createClient>;

/**
 * SPRITE mode (default, recommended): each feature is generated as a transparent
 * object sprite (pixflux no_background), composited onto the grass, and its alpha
 * OR'd into the collision layer — clean edges, pixel-accurate collision.
 */
async function buildSprite(client: Client, spec: Spec): Promise<BuiltMap> {
  console.log(`▸ generating base: "${spec.base}" (${spec.size}×${spec.size})...`);
  const base = await generateMap(client, { description: spec.base, size: spec.size, seed: spec.seed });

  // Objects are NOT composited into the map — they are emitted as separate
  // placements so the game can y-sort them against the character (walk-behind).
  // Collision is each solid object's BASE FOOTPRINT (bottom band of its alpha).
  const collision = new Uint8Array(spec.size * spec.size);
  const objects: ObjPlace[] = [];
  let solidCount = 0;

  for (let i = 0; i < spec.features.length; i++) {
    const f = spec.features[i];
    const rect = rectOf(f, spec.size);
    console.log(`▸ object ${i + 1}/${spec.features.length}: "${f.prompt}" @ [${f.rect.join(",")}]...`);
    const genSize = Math.max(32, Math.min(128, Math.max(rect.w, rect.h)));
    const obj = await generateObject(client, {
      description: f.prompt,
      size: genSize,
      seed: spec.seed,
      textGuidanceScale: f.guidance ?? 8,
    });
    const resized = await sharp(Buffer.from(obj.pngBase64, "base64"))
      .resize(rect.w, rect.h, { kernel: "nearest" })
      .png()
      .toBuffer();
    // Trim transparent padding so the placement matches the visible object.
    const t = await trimToContent(resized, rect.w, rect.h);
    const placed: Rect = { x: rect.x + t.dx, y: rect.y + t.dy, w: t.w, h: t.h };
    objects.push({ spriteB64: t.png.toString("base64"), x: placed.x, y: placed.y, w: placed.w, h: placed.h, shadow: f.collides });
    if (f.collides) {
      stampFootprint(collision, spec.size, placed, f.footprint);
      solidCount++;
    }
  }

  const collisionPng = await collisionToPng(collision, spec.size);
  console.log(`  done (${solidCount}/${spec.features.length} features solid, base-footprint collision)`);
  return { mapB64: base.pngBase64, collisionB64: collisionPng.toString("base64"), objects };
}

/**
 * INPAINT mode: sequentially regenerate each feature's rect via /inpaint, using
 * the rules learned from testing — guidance 8 and the feature's background named
 * in the prompt (so the box fills with grass, not a dark backdrop). Collision is
 * the feature rect (inpaint fills the whole box, so there is no alpha to trace).
 * Capped at 200px by sync /inpaint; expect a faint box-seam at each feature.
 */
async function buildInpaint(client: Client, spec: Spec): Promise<BuiltMap> {
  if (spec.size > 200) {
    die(`inpaint mode requires "size" <= 200 (sync /inpaint cap); spec has ${spec.size}`);
  }
  console.log(`▸ generating base: "${spec.base}" (${spec.size}×${spec.size})...`);
  const base = await generateMap(client, { description: spec.base, size: spec.size, seed: spec.seed });
  let mapB64 = base.pngBase64;
  const collisionRects: Rect[] = [];

  for (let i = 0; i < spec.features.length; i++) {
    const f = spec.features[i];
    const rect = rectOf(f, spec.size);
    const prompt = `${f.prompt}, on a ${spec.background} background, top-down`;
    console.log(`▸ inpaint ${i + 1}/${spec.features.length}: "${prompt}" @ [${f.rect.join(",")}]...`);
    const maskB64 = (await rectsToMaskPng(spec.size, [rect])).toString("base64");
    const res = await inpaint(client, {
      baseImagePng: mapB64,
      maskPng: maskB64,
      description: prompt,
      size: spec.size,
      seed: spec.seed,
      textGuidanceScale: f.guidance ?? 8, // 8 works; default 3 is too low
    });
    mapB64 = res.pngBase64;
    if (f.collides) collisionRects.push(rect);
  }

  const collisionPng = await rectsToMaskPng(spec.size, collisionRects); // white = blocked
  console.log(`  done (${collisionRects.length}/${spec.features.length} features solid)`);
  // Inpaint bakes objects into the map image, so there are no separate props.
  return { mapB64, collisionB64: collisionPng.toString("base64"), objects: [] };
}

async function main(): Promise<void> {
  const { specPath, characterDir, outDir, open, mode } = parseArgs(process.argv);

  const spec = SpecSchema.parse(JSON.parse(readFileSync(resolve(specPath), "utf8")));
  const out = resolve(outDir);
  const cacheDir = join(out, ".cache");
  mkdirSync(cacheDir, { recursive: true });

  const character = loadCharacter(characterDir);
  const cachePath = join(cacheDir, `map-${hashSpec(spec, mode)}.json`);

  let built: BuiltMap | null = existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, "utf8")) as BuiltMap)
    : null;

  if (built) {
    console.log(`▸ using cached map for this spec+mode (${cachePath})`);
  } else {
    const apiKey = process.env.PIXELLAB_API_KEY;
    if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");
    const client = createClient(apiKey);
    console.log(`▸ mode: ${mode}`);
    built = mode === "inpaint" ? await buildInpaint(client, spec) : await buildSprite(client, spec);
    writeFileSync(cachePath, JSON.stringify(built));
  }

  const mapPng = Buffer.from(built.mapB64, "base64");
  const collisionPng = Buffer.from(built.collisionB64, "base64");
  const charPng = await removeFlatBackground(readFileSync(character.pngPath));
  const placements: ObjectPlacement[] = built.objects.map((o) => ({
    png: Buffer.from(o.spriteB64, "base64"),
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    shadow: o.shadow,
  }));

  writeFileSync(join(out, "map.png"), mapPng);
  writeFileSync(join(out, "collision.png"), collisionPng);
  const gamePath = emitGame(
    out,
    mapPng,
    { width: spec.size, height: spec.size },
    charPng,
    character.manifest,
    collisionPng,
    placements,
  );
  console.log(
    `▸ wrote ${out}/{map.png, collision.png, game.html} ` +
      `(${spec.features.length} features, ${placements.length} props)`,
  );

  if (open) {
    spawn("open", [gamePath], { stdio: "ignore", detached: true }).unref();
  }
}

main().catch((err) => {
  if (err instanceof PixelLabError) {
    console.error(`error: ${err.message}`);
    if (err.body) console.error(err.body.slice(0, 1000));
  } else {
    console.error(err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
});
