import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "./config.js";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateBaseSprite } from "./pixellab/generate.js";
import { animateAction } from "./pixellab/animate.js";
import { generate8Directions } from "./pixellab/generate8.js";
import { buildManifest } from "./sheet/manifest.js";
import { packSheet } from "./sheet/pack.js";
import { emitPreview } from "./preview/emit.js";
import { DIRECTIONS_1, DIRECTIONS_8 } from "./types.js";

type Args = { configPath: string; outDir: string; open: boolean };

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let configPath: string | undefined;
  let outDir = "./output";
  let open = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") outDir = args[++i];
    else if (a === "--open") open = true;
    else if (!a.startsWith("--")) configPath = a;
    else die(`unknown arg: ${a}`);
  }
  if (!configPath) die("usage: gen <config.json> [--out DIR] [--open]");
  return { configPath, outDir, open };
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function ts(): number {
  return Date.now();
}

function fmt(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

async function main(): Promise<void> {
  const { configPath, outDir, open } = parseArgs(process.argv);
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) die("PIXELLAB_API_KEY missing (populate .env)");

  const config = loadConfig(configPath);
  const characterOut = resolve(outDir, config.name);
  mkdirSync(characterOut, { recursive: true });

  const client = createClient(apiKey);
  const dirCount = config.directions ?? 1;
  const directions = dirCount === 8 ? DIRECTIONS_8 : DIRECTIONS_1;

  // Build base sprites: Record<direction, base64>
  let baseSpritesByDir: Record<string, string>;

  if (dirCount === 8) {
    let t = ts();
    console.log(`▸ ${config.name}: generating 8-direction base sprites...`);
    baseSpritesByDir = await generate8Directions(client, config.description, config.size);
    console.log(`  done (${fmt(ts() - t)})`);
  } else {
    let t = ts();
    console.log(`▸ ${config.name}: generating base sprite...`);
    const baseBase64 = await generateBaseSprite(client, config.description, config.size);
    console.log(`  done (${fmt(ts() - t)})`);
    baseSpritesByDir = { south: baseBase64 };
  }

  // Animate every direction × action pair, build rowsFrames in manifest row order.
  // Row index = dirIdx * actions.length + actionIdx
  const totalRows = directions.length * config.actions.length;
  const rowsFrames: Buffer[][] = new Array(totalRows);

  for (let dirIdx = 0; dirIdx < directions.length; dirIdx++) {
    const dir = directions[dirIdx];
    const baseBase64 = baseSpritesByDir[dir];
    for (let actionIdx = 0; actionIdx < config.actions.length; actionIdx++) {
      const action = config.actions[actionIdx];
      const rowIndex = dirIdx * config.actions.length + actionIdx;
      let t = ts();
      console.log(`▸ ${config.name}/${dir}/${action.name}: animating (${action.frames} frames)...`);
      const frames = await animateAction(client, baseBase64, action.prompt, action.frames, config.size);
      console.log(`  done (${fmt(ts() - t)})`);
      rowsFrames[rowIndex] = frames.map((b64) => Buffer.from(b64, "base64"));
    }
  }

  const manifest = buildManifest(
    config.size,
    directions,
    config.actions.map((a) => ({ name: a.name, frames: a.frames })),
  );

  console.log(`▸ packing sheet ${manifest.columns}×${manifest.rows} @ ${config.size}px...`);
  const sheetPng = await packSheet(config.size, manifest.columns, manifest.rows, rowsFrames);
  writeFileSync(join(characterOut, "spritesheet.png"), sheetPng);
  writeFileSync(join(characterOut, "spritesheet.json"), JSON.stringify(manifest, null, 2));

  const previewPath = emitPreview(characterOut, manifest);
  console.log(`▸ wrote ${characterOut}/{spritesheet.png, spritesheet.json, preview.html}`);

  if (open) {
    spawn("open", [previewPath], { stdio: "ignore", detached: true }).unref();
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
