export type ActionSpec = {
  name: string;
  prompt: string;
  frames: number;
};

export type CharacterConfig = {
  name: string;
  description: string;
  size: 64;
  directions?: 1 | 8;
  actions: ActionSpec[];
};

export type ActionManifestEntry = {
  frameCount: number;
  durationMs: number;
  rowByDirection: Record<string, number>;
};

export type Manifest = {
  image: "spritesheet.png";
  frameSize: number;
  columns: number;
  rows: number;
  directions: string[];
  actions: Record<string, ActionManifestEntry>;
};

export const DIRECTIONS_1 = ["south"] as const;
export const DIRECTIONS_8 = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;
