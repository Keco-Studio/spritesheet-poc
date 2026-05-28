import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "./config.js";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { generateBaseSprite } from "./pixellab/generate.js";
import { animateAction } from "./pixellab/animate.js";
import { buildManifest } from "./sheet/manifest.js";
import { packSheet } from "./sheet/pack.js";
import { emitPreview } from "./preview/emit.js";

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

  let t = ts();
  console.log(`▸ ${config.name}: generating base sprite...`);
  const baseBase64 = await generateBaseSprite(client, config.description, config.size);
  console.log(`  done (${fmt(ts() - t)})`);

  const rowsFrames: Buffer[][] = [];
  for (const action of config.actions) {
    t = ts();
    console.log(`▸ ${config.name}/${action.name}: animating (${action.frames} frames)...`);
    const frames = await animateAction(client, baseBase64, action.prompt, action.frames, config.size);
    console.log(`  done (${fmt(ts() - t)})`);
    rowsFrames.push(frames.map((b64) => Buffer.from(b64, "base64")));
  }

  const manifest = buildManifest(
    config.size,
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
