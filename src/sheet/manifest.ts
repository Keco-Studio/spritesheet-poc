import type { Manifest } from "../types.js";

const DEFAULT_DURATION_MS = 100;

export function buildManifest(
  frameSize: number,
  directions: readonly string[],
  actions: Array<{ name: string; frames: number }>,
): Manifest {
  const columns = Math.max(...actions.map((a) => a.frames));
  const actionMap: Manifest["actions"] = {};
  actions.forEach((a, actionIdx) => {
    const rowByDirection: Record<string, number> = {};
    directions.forEach((dir, dirIdx) => {
      rowByDirection[dir] = dirIdx * actions.length + actionIdx;
    });
    actionMap[a.name] = {
      frameCount: a.frames,
      durationMs: DEFAULT_DURATION_MS,
      rowByDirection,
    };
  });
  return {
    image: "spritesheet.png",
    frameSize,
    columns,
    rows: directions.length * actions.length,
    directions: [...directions],
    actions: actionMap,
  };
}
