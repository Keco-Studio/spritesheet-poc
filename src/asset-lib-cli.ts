import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateObject } from "./pixellab/object.js";
import { removeFlatBackground } from "./sheet/transparency.js";

const LIBRARY = [
  { id: "oak-tree", name: "Oak Tree", prompt: "a single round leafy oak tree seen from directly above", footprint: 0.3, genSize: 80 },
  { id: "pine-tree", name: "Pine Tree", prompt: "a single tall green pine tree seen from above", footprint: 0.3, genSize: 80 },
  { id: "bush", name: "Bush", prompt: "a small round green bush seen from above", footprint: 0.6, genSize: 48 },
  { id: "rock", name: "Rock", prompt: "a single gray boulder seen from above", footprint: 0.7, genSize: 48 },
  { id: "boulders", name: "Boulders", prompt: "a pile of gray stone boulders seen from above", footprint: 0.6, genSize: 72 },
  { id: "pond", name: "Pond", prompt: "a small round blue pond of water seen from above", footprint: 1.0, genSize: 80 },
  { id: "flowers", name: "Flowers", prompt: "a small patch of pink flowers seen from above", footprint: 0.4, genSize: 48 },
  { id: "stump", name: "Stump", prompt: "a brown tree stump seen from above", footprint: 0.8, genSize: 40 },
  { id: "barrel", name: "Barrel", prompt: "a wooden barrel seen from above", footprint: 0.9, genSize: 40 },
  { id: "crate", name: "Crate", prompt: "a wooden crate seen from above", footprint: 0.9, genSize: 40 },
] as const;

function die(msg: string): never { console.error(msg); process.exit(1); }

async function trim(png: Buffer): Promise<{ png: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return { png, w, h };
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = await sharp(png).extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer();
  return { png: out, w: cw, h: ch };
}

async function main(): Promise<void> {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");
  const client = createClient(apiKey);

  const outDir = resolve("app/public/assets");
  mkdirSync(outDir, { recursive: true });
  const cacheDir = join(outDir, ".cache");
  mkdirSync(cacheDir, { recursive: true });

  const manifestAssets: Array<{ id: string; name: string; file: string; footprint: number; w: number; h: number }> = [];

  for (const a of LIBRARY) {
    const file = `${a.id}.png`;
    const cachePath = join(cacheDir, `${a.id}.json`);
    let trimmed: { png: Buffer; w: number; h: number };
    if (existsSync(cachePath)) {
      console.log(`▸ ${a.id}: cached`);
      const c = JSON.parse(readFileSync(cachePath, "utf8")) as { b64: string; w: number; h: number };
      trimmed = { png: Buffer.from(c.b64, "base64"), w: c.w, h: c.h };
    } else {
      console.log(`▸ ${a.id}: generating "${a.prompt}"...`);
      const obj = await generateObject(client, { description: a.prompt, size: a.genSize });
      trimmed = await trim(Buffer.from(obj.pngBase64, "base64"));
      writeFileSync(cachePath, JSON.stringify({ b64: trimmed.png.toString("base64"), w: trimmed.w, h: trimmed.h }));
    }
    writeFileSync(join(outDir, file), trimmed.png);
    manifestAssets.push({ id: a.id, name: a.name, file, footprint: a.footprint, w: trimmed.w, h: trimmed.h });
  }

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ assets: manifestAssets }, null, 2));
  console.log(`▸ wrote ${outDir}/manifest.json (${manifestAssets.length} assets)`);

  const charDir = resolve("app/public/character");
  mkdirSync(charDir, { recursive: true });
  const srcChar = resolve("output/knight");
  if (existsSync(join(srcChar, "spritesheet.png")) && existsSync(join(srcChar, "spritesheet.json"))) {
    const clean = await removeFlatBackground(readFileSync(join(srcChar, "spritesheet.png")));
    writeFileSync(join(charDir, "spritesheet.png"), clean);
    writeFileSync(join(charDir, "spritesheet.json"), readFileSync(join(srcChar, "spritesheet.json")));
    console.log(`▸ bundled character from ${srcChar}`);
  } else {
    console.log(`! no character at ${srcChar}; run \`npm run gen examples/knight.json\` then re-run \`npm run assets\``);
  }
}

main().catch((err) => {
  if (err instanceof PixelLabError) { console.error(`error: ${err.message}`); if (err.body) console.error(err.body.slice(0, 1000)); }
  else console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
