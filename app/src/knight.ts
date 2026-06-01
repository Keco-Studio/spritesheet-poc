import { Actor, Vector, ImageSource, SpriteSheet, Animation } from "excalibur";

type Manifest = {
  frameSize: number; columns: number; rows: number; directions: string[];
  actions: Record<string, { frameCount: number; durationMs: number; rowByDirection: Record<string, number> }>;
};

// Clockwise sectors from +x, used to map a movement vector to one of 8 facings.
const SECTORS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

export interface Knight {
  actor: Actor;
  /** Offset from the actor's center down to its feet, where collision is sampled. */
  footY: number;
  directions: string[];
  /** Pick an 8-way facing name from a movement vector. */
  dirFromVec(vx: number, vy: number): string;
  /** Swap the displayed animation for the given facing + moving state. */
  setState(facing: string, moving: boolean): void;
}

/** Load the knight spritesheet (from /character/) and build a ready-to-add Excalibur actor. */
export async function loadKnight(opts: { scale?: number } = {}): Promise<Knight> {
  const scale = opts.scale ?? 0.4;
  const manifest: Manifest = await (await fetch("/character/spritesheet.json")).json();
  const image = new ImageSource("/character/spritesheet.png");
  await image.load();

  const sheet = SpriteSheet.fromImageSource({
    image,
    grid: { columns: manifest.columns, rows: manifest.rows, spriteWidth: manifest.frameSize, spriteHeight: manifest.frameSize },
  });
  const walkName = manifest.actions.walk ? "walk" : Object.keys(manifest.actions)[0];
  const idleName = manifest.actions.idle ? "idle" : walkName;
  const build = (action: string, dir: string): Animation => {
    const act = manifest.actions[action];
    const row = act.rowByDirection[dir] ?? act.rowByDirection[manifest.directions[0]];
    const frames = [];
    for (let c = 0; c < act.frameCount; c++) frames.push({ graphic: sheet.getSprite(c, row), duration: act.durationMs });
    const anim = new Animation({ frames });
    anim.scale = new Vector(scale, scale);
    return anim;
  };
  const anims: Record<string, Record<string, Animation>> = {};
  for (const dir of manifest.directions) anims[dir] = { walk: build(walkName, dir), idle: build(idleName, dir) };

  const footY = manifest.frameSize * scale * 0.25;
  let facing = manifest.directions.includes("south") ? "south" : manifest.directions[0];
  const actor = new Actor({ pos: new Vector(0, 0), z: 1 });
  actor.graphics.use(anims[facing].idle);

  const dirFromVec = (vx: number, vy: number): string => {
    let deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const want = SECTORS[Math.round(deg / 45) % 8];
    return manifest.directions.includes(want) ? want : manifest.directions[0];
  };
  const setState = (f: string, moving: boolean): void => {
    facing = f;
    actor.graphics.use(anims[facing][moving ? "walk" : "idle"]);
  };

  return { actor, footY, directions: manifest.directions, dirFromVec, setState };
}
