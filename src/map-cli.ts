import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateMap, type MapResult, type MapMeta } from "./pixellab/map.js";
import { emitGame } from "./game/emit.js";
import { removeFlatBackground } from "./sheet/transparency.js";
import type { Manifest } from "./types.js";

type Args = {
  prompt?: string;
  size: number;
  seed?: number;
  characterDir: string;
  outDir: string;
  fromPng?: string;
  open: boolean;
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let prompt: string | undefined;
  let size = 320;
  let seed: number | undefined;
  let characterDir = "./output/knight";
  let outDir = "./output/map";
  let fromPng: string | undefined;
  let open = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--prompt") prompt = args[++i];
    else if (a === "--size") {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 16 || n > 400) die("--size must be an integer 16..400");
      size = n;
    } else if (a === "--seed") {
      const n = Number(args[++i]);
      if (!Number.isInteger(n)) die("--seed must be an integer");
      seed = n;
    } else if (a === "--character") characterDir = args[++i];
    else if (a === "--out") outDir = args[++i];
    else if (a === "--from-png") fromPng = args[++i];
    else if (a === "--open") open = true;
    else die(`unknown arg: ${a}`);
  }
  if (!fromPng && !prompt) {
    die(
      'usage: map --prompt "<map description>" [--size 16..400] [--seed N] [--character DIR] [--out DIR] [--open]\n' +
        "       map --from-png PATH [--character DIR] [--out DIR] [--open]   (offline; no credits)",
    );
  }
  return { prompt, size, seed, characterDir, outDir, fromPng, open };
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

/**
 * Load a character spritesheet (PNG + manifest) produced by `npm run gen`.
 * Keys out the flat backdrop PixelLab bakes into character frames so the
 * sprite composites cleanly onto the map (works even for sheets generated
 * before the pipeline started removing it).
 */
async function loadCharacter(dir: string): Promise<{ png: Buffer; manifest: Manifest }> {
  const charDir = resolve(dir);
  const pngPath = join(charDir, "spritesheet.png");
  const manifestPath = join(charDir, "spritesheet.json");
  if (!existsSync(pngPath) || !existsSync(manifestPath)) {
    die(
      `character not found in ${charDir} (need spritesheet.png + spritesheet.json).\n` +
        `Generate one first, e.g.: npm run gen examples/knight.json`,
    );
  }
  return {
    png: await removeFlatBackground(readFileSync(pngPath)),
    manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest,
  };
}

async function main(): Promise<void> {
  const { prompt, size, seed, characterDir, outDir, fromPng, open } = parseArgs(process.argv);
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });

  let mapPng: Buffer;
  let mapMeta: MapMeta;

  if (fromPng) {
    // OFFLINE MODE: composite the character onto an existing map image. No API call.
    const srcPath = resolve(fromPng);
    if (!existsSync(srcPath)) die(`--from-png file not found: ${srcPath}`);
    mapPng = readFileSync(srcPath);
    const md = await sharp(mapPng).metadata();
    if (!md.width || !md.height) die(`could not read image dimensions from ${srcPath}`);
    mapMeta = { width: md.width, height: md.height };
    console.log(`▸ from-png: map ${md.width}×${md.height}`);
  } else {
    const apiKey = process.env.PIXELLAB_API_KEY;
    if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");

    const cacheDir = join(out, ".cache");
    mkdirSync(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, "map.json");

    let result = readJsonCache<MapResult>(cachePath);
    if (result) {
      console.log(`▸ using cached map (${cachePath})`);
    } else {
      const client = createClient(apiKey);
      console.log(`▸ generating map: "${prompt}" (${size}×${size})...`);
      result = await generateMap(client, { description: prompt!, size, seed });
      writeJsonCache(cachePath, result);
      console.log(`  done`);
    }
    mapPng = Buffer.from(result.pngBase64, "base64");
    mapMeta = result.meta;
  }

  const character = await loadCharacter(characterDir);

  writeFileSync(join(out, "map.png"), mapPng);
  const gamePath = emitGame(out, mapPng, mapMeta, character.png, character.manifest);
  console.log(
    `▸ wrote ${out}/{map.png, game.html} — character: ${characterDir} ` +
      `(${character.manifest.directions.length} dir, ${Object.keys(character.manifest.actions).join("/")})`,
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
