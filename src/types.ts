export type ActionSpec = {
  name: string;
  prompt: string;
  frames: number;
};

export type CharacterConfig = {
  name: string;
  description: string;
  size: 64;
  actions: ActionSpec[];
};

export type ActionManifestEntry = {
  row: number;
  frameCount: number;
  durationMs: number;
};

export type Manifest = {
  image: "spritesheet.png";
  frameSize: number;
  columns: number;
  rows: number;
  actions: Record<string, ActionManifestEntry>;
};
