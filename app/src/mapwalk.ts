import { Engine, Actor, Vector, ImageSource, Color, Keys, DisplayMode, type PreUpdateEvent } from "excalibur";
import { loadMapIR } from "../../src/mapcompiler/loadMapIR.js";
import { compile } from "../../src/mapcompiler/compile.js";
import { renderSemanticMap } from "../../src/mapcompiler/renderSemanticMap.js";
import { isWalkableAt, type Grid } from "../../src/mapcompiler/grid-collision.js";
import { loadKnight } from "./knight.js";

const MAP_URL = "/maps/mountain_river_village.json";
const SPEED = 70; // world px / second

function setStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}
function setReport(text: string, ok: boolean): void {
  const el = document.getElementById("report");
  if (!el) return;
  el.textContent = text;
  el.className = ok ? "ok" : "bad";
}

async function main(): Promise<void> {
  const mapIR = await loadMapIR(MAP_URL);
  const compiled = compile(mapIR);
  const tile = compiled.tileSize;
  const W = compiled.width * tile, H = compiled.height * tile;

  // Render the semantic map once to an offscreen canvas → background image.
  const off = document.createElement("canvas");
  const ctx = off.getContext("2d")!;
  renderSemanticMap(ctx, compiled, { tilePx: tile, legend: mapIR.legend });
  const bg = new ImageSource(off.toDataURL());
  await bg.load();

  const game = new Engine({
    canvasElementId: "game",
    width: W, height: H,
    displayMode: DisplayMode.Fixed,
    pixelArt: true,
    backgroundColor: Color.fromHex("#101014"),
    suppressPlayButton: true,
  });

  const bgActor = new Actor({ pos: new Vector(0, 0), anchor: new Vector(0, 0), z: -100000 });
  bgActor.graphics.use(bg.toSprite());
  game.currentScene.add(bgActor);

  const knight = await loadKnight({ scale: 0.4 });
  const spawn = compiled.spawns[0];
  knight.actor.pos = spawn
    ? new Vector((spawn.x + 0.5) * tile, (spawn.y + 0.5) * tile)
    : new Vector(W / 2, H / 2);
  game.currentScene.add(knight.actor);

  // Whole map visible (engine resolution == map pixels); center the camera.
  game.currentScene.camera.pos = new Vector(W / 2, H / 2);
  game.currentScene.camera.zoom = 1;

  const grid: Grid = { walkable: compiled.walkable, width: compiled.width, height: compiled.height, tileSize: tile };
  let facing = knight.directions.includes("south") ? "south" : knight.directions[0];

  game.on("preupdate", (evt: PreUpdateEvent<Engine>) => {
    const dt = (evt?.elapsed ?? 16) / 1000;
    const kb = game.input.keyboard;
    let vx = 0, vy = 0;
    if (kb.isHeld(Keys.A) || kb.isHeld(Keys.Left)) vx -= 1;
    if (kb.isHeld(Keys.D) || kb.isHeld(Keys.Right)) vx += 1;
    if (kb.isHeld(Keys.W) || kb.isHeld(Keys.Up)) vy -= 1;
    if (kb.isHeld(Keys.S) || kb.isHeld(Keys.Down)) vy += 1;
    const moving = vx !== 0 || vy !== 0;
    const p = knight.actor;
    if (moving) {
      const len = Math.hypot(vx, vy), step = SPEED * dt;
      const nx = Math.max(0, Math.min(W - 1, p.pos.x + (vx / len) * step));
      const ny = Math.max(0, Math.min(H - 1, p.pos.y + (vy / len) * step));
      // Per-axis test at the feet point (project invariant: manual preupdate collision).
      if (isWalkableAt(grid, nx, p.pos.y + knight.footY)) p.pos.x = nx;
      if (isWalkableAt(grid, p.pos.x, ny + knight.footY)) p.pos.y = ny;
      facing = knight.dirFromVec(vx, vy);
    }
    knight.setState(facing, moving);
  });

  const v = compiled.validation;
  setStatus(`${compiled.name} (${compiled.width}×${compiled.height}) — spawn: ${spawn?.npcId ?? "center"}. WASD to walk.`);
  setReport(
    v.ok ? "validation OK — 0 errors" : v.errors.map((e) => `${e.rule}: ${e.message}`).join("\n"),
    v.ok,
  );

  await game.start();
}

main().catch((err) => {
  setStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
});
