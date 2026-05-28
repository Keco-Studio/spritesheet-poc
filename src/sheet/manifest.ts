import type { Manifest } from "../types.js";

const DEFAULT_DURATION_MS = 100;

export function buildManifest(
  frameSize: number,
  actions: Array<{ name: string; frames: number }>,
): Manifest {
  const columns = Math.max(...actions.map((a) => a.frames));
  const actionMap: Manifest["actions"] = {};
  actions.forEach((a, row) => {
    actionMap[a.name] = {
      row,
      frameCount: a.frames,
      durationMs: DEFAULT_DURATION_MS,
    };
  });
  return {
    image: "spritesheet.png",
    frameSize,
    columns,
    rows: actions.length,
    actions: actionMap,
  };
}
