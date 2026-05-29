import { Scene, Actor, Vector, ImageSource, SpriteSheet, Animation, Engine, Keys } from "excalibur";
import type { SceneActivationContext } from "excalibur";
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { colliders, isSolid, type AssetLookup } from "../../src/sheet/scene-collision.js";
import type { Ellipse } from "../../src/sheet/footprint.js";

type Manifest = {
  frameSize: number; columns: number; rows: number; directions: string[];
  actions: Record<string, { frameCount: number; durationMs: number; rowByDirection: Record<string, number> }>;
};

const SECTORS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
const CHAR_SCALE = 0.9, SPEED = 70, ZOOM = 2;

export class PlayScene extends Scene {
  private store: Store;
  private lib: LoadedLibrary;
  private charImage = new ImageSource("/character/spritesheet.png");
  private manifest: Manifest | null = null;
  private player: Actor | null = null;
  private ellipses: Ellipse[] = [];
  private anims: Record<string, Record<string, Animation>> = {};
  private facing = "south";
  private footY = 0;
  // Reconciliation: Scene has no clear() method in this Excalibur version.
  // Track visuals added in rebuildVisuals so we can kill them on rebuild.
  private visualActors: Actor[] = [];
  // Base-map actor is kept alive across rebuilds to avoid flicker when toggling Edit↔Play.
  private baseMapUrl: string | null = null;
  private baseActor: Actor | null = null;

  constructor(store: Store, lib: LoadedLibrary) { super(); this.store = store; this.lib = lib; }

  // Reconciliation: onActivate takes a SceneActivationContext arg per installed Excalibur types.
  async onActivate(_context: SceneActivationContext): Promise<void> {
    this.ellipses = colliders(this.store.state.placements, this.lib.lookup);
    if (!this.manifest) {
      this.manifest = await (await fetch("/character/spritesheet.json")).json();
      await this.charImage.load();
      this.buildPlayer();
    } else if (this.player) {
      this.player.pos = new Vector(this.store.state.mapW / 2, this.store.state.mapH / 2);
    }
    this.rebuildVisuals();
  }

  private rebuildVisuals(): void {
    // Reconciliation: no this.clear() — kill previously-tracked visual actors instead.
    // Do NOT kill this.player; it is re-added below so it persists across rebuilds.
    for (const a of this.visualActors) a.kill();
    this.visualActors = [];

    const s = this.store.state;
    // Only (re)create the base-map actor when the URL changes, to avoid flicker on Edit↔Play toggle.
    if (s.baseMapDataUrl !== this.baseMapUrl) {
      this.baseMapUrl = s.baseMapDataUrl;
      if (this.baseActor) { this.baseActor.kill(); this.baseActor = null; }
      if (s.baseMapDataUrl) {
        const img = new ImageSource(s.baseMapDataUrl);
        const a = new Actor({ pos: new Vector(0, 0), anchor: new Vector(0, 0), z: -100000 });
        img.load().then(() => a.graphics.use(img.toSprite()));
        this.add(a);
        this.baseActor = a;
      }
    }
    for (const p of s.placements) {
      const e = this.lib.entry(p.assetId);
      const a = new Actor({ pos: new Vector(p.x, p.y), anchor: new Vector(0.5, 1), z: p.y });
      const sprite = this.lib.images[p.assetId].toSprite();
      // Reconciliation: sprite.destSize assignment does not work in this Excalibur version;
      // use sprite.width / sprite.height setters instead (same fix as editor-scene.ts).
      sprite.width = e.w;
      sprite.height = e.h;
      a.graphics.use(sprite);
      this.add(a);
      this.visualActors.push(a);
    }
    if (this.player) this.add(this.player);
  }

  private buildPlayer(): void {
    const m = this.manifest!;
    const sheet = SpriteSheet.fromImageSource({
      image: this.charImage,
      grid: { columns: m.columns, rows: m.rows, spriteWidth: m.frameSize, spriteHeight: m.frameSize },
    });
    const walkName = m.actions.walk ? "walk" : Object.keys(m.actions)[0];
    const idleName = m.actions.idle ? "idle" : walkName;
    const build = (action: string, dir: string) => {
      const act = m.actions[action];
      const row = act.rowByDirection[dir] ?? act.rowByDirection[m.directions[0]];
      const frames = [];
      for (let c = 0; c < act.frameCount; c++) frames.push({ graphic: sheet.getSprite(c, row), duration: act.durationMs });
      const anim = new Animation({ frames });
      anim.scale = new Vector(CHAR_SCALE, CHAR_SCALE);
      return anim;
    };
    for (const dir of m.directions) this.anims[dir] = { walk: build(walkName, dir), idle: build(idleName, dir) };
    this.footY = m.frameSize * CHAR_SCALE * 0.25;
    this.facing = m.directions.includes("south") ? "south" : m.directions[0];
    const player = new Actor({ pos: new Vector(this.store.state.mapW / 2, this.store.state.mapH / 2), z: 0 });
    player.graphics.use(this.anims[this.facing].idle);
    this.player = player;
  }

  onInitialize(_engine: Engine): void { this.camera.zoom = ZOOM; }

  // Reconciliation: onPreUpdate signature is (engine: Engine, elapsed: number) where elapsed is ms.
  onPreUpdate(engine: Engine, elapsed: number): void {
    if (this.store.state.mode !== "play" || !this.player) return;
    const kb = engine.input.keyboard;
    const dt = elapsed / 1000;
    let vx = 0, vy = 0;
    if (kb.isHeld(Keys.A) || kb.isHeld(Keys.Left)) vx -= 1;
    if (kb.isHeld(Keys.D) || kb.isHeld(Keys.Right)) vx += 1;
    if (kb.isHeld(Keys.W) || kb.isHeld(Keys.Up)) vy -= 1;
    if (kb.isHeld(Keys.S) || kb.isHeld(Keys.Down)) vy += 1;
    const moving = vx !== 0 || vy !== 0;
    const p = this.player;
    if (moving) {
      const len = Math.hypot(vx, vy), step = SPEED * dt;
      const nx = Math.max(0, Math.min(this.store.state.mapW, p.pos.x + (vx / len) * step));
      const ny = Math.max(0, Math.min(this.store.state.mapH, p.pos.y + (vy / len) * step));
      if (!isSolid(this.ellipses, nx, p.pos.y + this.footY)) p.pos.x = nx;
      if (!isSolid(this.ellipses, p.pos.x, ny + this.footY)) p.pos.y = ny;
      this.facing = this.dirFromVec(vx, vy);
    }
    p.graphics.use(this.anims[this.facing][moving ? "walk" : "idle"]);
    p.z = p.pos.y + this.footY;
    this.camera.pos = p.pos.clone();
  }

  private dirFromVec(vx: number, vy: number): string {
    let deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const want = SECTORS[Math.round(deg / 45) % 8];
    return this.manifest!.directions.includes(want) ? want : this.manifest!.directions[0];
  }
}

export type { AssetLookup };
