import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createClient, PixelLabError } from "./pixellab/client.js";
import { removeFlatBackground } from "./sheet/transparency.js";
import { emitGame, type ObjectPlacement } from "./game/emit.js";
import type { Manifest } from "./types.js";
import { SpecSchema, hashSpec, type Spec, type Mode, type BuiltMap } from "./buildmap/spec.js";
import { buildSprite } from "./buildmap/build-sprite.js";
import { buildInpaint } from "./buildmap/build-inpaint.js";

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

function loadCharacter(dir: string): { pngPath: string; manifest: Manifest } {
  const charDir = resolve(dir);
  const pngPath = join(charDir, "spritesheet.png");
  const manifestPath = join(charDir, "spritesheet.json");
  if (!existsSync(pngPath) || !existsSync(manifestPath)) {
    die(`character not found in ${charDir} (need spritesheet.png + spritesheet.json).`);
  }
  return { pngPath, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest };
}

async function main(): Promise<void> {
  const { specPath, characterDir, outDir, open, mode } = parseArgs(process.argv);

  const spec: Spec = SpecSchema.parse(JSON.parse(readFileSync(resolve(specPath), "utf8")));
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
