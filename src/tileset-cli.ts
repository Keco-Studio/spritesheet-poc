import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateTileset, type TilesetResult, type TilesetMeta } from "./pixellab/tileset.js";
import { emitEditor } from "./editor/emit.js";

type Args = {
  lower?: string;
  upper?: string;
  transition?: string;
  tileSize: 16 | 32;
  seed?: number;
  outDir: string;
  fromPng?: string;
  open: boolean;
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let lower: string | undefined;
  let upper: string | undefined;
  let transition: string | undefined;
  let tileSize: 16 | 32 = 16;
  let seed: number | undefined;
  let outDir = "./output/tileset";
  let fromPng: string | undefined;
  let open = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--lower") lower = args[++i];
    else if (a === "--upper") upper = args[++i];
    else if (a === "--transition") transition = args[++i];
    else if (a === "--tile-size") {
      const n = Number(args[++i]);
      if (n !== 16 && n !== 32) die("--tile-size must be 16 or 32");
      tileSize = n;
    } else if (a === "--seed") {
      const n = Number(args[++i]);
      if (!Number.isInteger(n)) die("--seed must be an integer");
      seed = n;
    } else if (a === "--out") outDir = args[++i];
    else if (a === "--from-png") fromPng = args[++i];
    else if (a === "--open") open = true;
    else die(`unknown arg: ${a}`);
  }
  if (!fromPng && (!lower || !upper)) {
    die(
      'usage: tileset --lower "<desc>" --upper "<desc>" [--transition "<desc>"] [--tile-size 16|32] [--seed N] [--out DIR] [--open]\n       tileset --from-png PATH [--tile-size 16|32] [--out DIR] [--open]',
    );
  }
  return { lower, upper, transition, tileSize, seed, outDir, fromPng, open };
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function readJsonCache<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJsonCache(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data));
}

async function main(): Promise<void> {
  const { lower, upper, transition, tileSize, seed, outDir, fromPng, open } = parseArgs(process.argv);
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });

  let pngBuffer: Buffer;
  let meta: TilesetMeta;

  if (fromPng) {
    // OFFLINE MODE: re-use an existing tileset sheet and derive the grid from
    // its pixel dimensions. PixelLab is never called — no credits are spent.
    const srcPath = resolve(fromPng);
    if (!existsSync(srcPath)) die(`--from-png file not found: ${srcPath}`);
    pngBuffer = readFileSync(srcPath);
    // sharp metadata reports the *intrinsic* pixel size; width/height may be
    // undefined for exotic inputs, so guard before trusting the grid math.
    const md = await sharp(pngBuffer).metadata();
    if (!md.width || !md.height) die(`could not read image dimensions from ${srcPath}`);
    const width = md.width;
    const height = md.height;
    meta = {
      width,
      height,
      tileWidth: tileSize,
      tileHeight: tileSize,
      columns: Math.floor(width / tileSize),
      rows: Math.floor(height / tileSize),
      tilesetId: "",
    };
    console.log(`▸ from-png: ${width}×${height} → ${meta.columns}×${meta.rows} tiles @ ${tileSize}px`);
  } else {
    const apiKey = process.env.PIXELLAB_API_KEY;
    if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");

    const cacheDir = join(out, ".cache");
    mkdirSync(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, "tileset.json");

    let result = readJsonCache<TilesetResult>(cachePath);
    if (result) {
      console.log(`▸ using cached tileset (${cachePath})`);
    } else {
      const client = createClient(apiKey);
      console.log(`▸ generating tileset: "${lower}" → "${upper}"...`);
      result = await generateTileset(client, {
        lowerDescription: lower!,
        upperDescription: upper!,
        transitionDescription: transition,
        tileSize,
        seed,
      });
      writeJsonCache(cachePath, result);
      console.log(`  done`);
    }
    pngBuffer = Buffer.from(result.pngBase64, "base64");
    meta = result.meta;
  }

  writeFileSync(join(out, "tileset.png"), pngBuffer);
  writeFileSync(join(out, "tileset.json"), JSON.stringify(meta, null, 2));

  const editorPath = emitEditor(out, pngBuffer, {
    width: meta.width,
    height: meta.height,
    tileWidth: meta.tileWidth,
    tileHeight: meta.tileHeight,
    columns: meta.columns,
    rows: meta.rows,
    name: meta.name,
  });
  console.log(`▸ wrote ${out}/{tileset.png, tileset.json, editor.html}`);

  if (open) {
    spawn("open", [editorPath], { stdio: "ignore", detached: true }).unref();
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
