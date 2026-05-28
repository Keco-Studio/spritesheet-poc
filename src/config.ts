import { readFileSync } from "node:fs";
import { z } from "zod";
import type { CharacterConfig } from "./types.js";

const ActionSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  frames: z.number().int().min(4).max(16),
});

const ConfigSchema = z
  .object({
    name: z.string().min(1).regex(/^[a-z0-9-]+$/, "name must be kebab-case"),
    description: z.string().min(1),
    size: z.literal(64),
    actions: z.array(ActionSchema).min(1).max(8),
  })
  .refine(
    (c) => new Set(c.actions.map((a) => a.name)).size === c.actions.length,
    { message: "duplicate action names" },
  );

export function parseConfig(raw: unknown): CharacterConfig {
  return ConfigSchema.parse(raw) as CharacterConfig;
}

export function loadConfig(path: string): CharacterConfig {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return parseConfig(raw);
}
