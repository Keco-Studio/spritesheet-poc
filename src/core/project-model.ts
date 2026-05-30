import { z } from "zod";

export const PlacementSchema = z.object({
  assetId: z.string().min(1),
  x: z.number(),
  y: z.number(),
});
export const ProjectSchema = z.object({
  baseMap: z.string().min(1), // data URL
  mapW: z.number().int().positive(),
  mapH: z.number().int().positive(),
  placements: z.array(PlacementSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export function serializeProject(p: Project): string {
  return JSON.stringify(ProjectSchema.parse(p));
}

export function parseProject(json: string): Project {
  return ProjectSchema.parse(JSON.parse(json));
}
