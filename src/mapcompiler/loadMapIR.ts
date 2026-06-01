import { z } from "zod";
import type { MapIR } from "./types.js";

const TileCoord = z.tuple([z.number(), z.number()]);

const TerrainShape = z.object({
  id: z.string(), type: z.string(), terrain: z.string().optional(),
  shape: z.enum(["rect", "polygon", "ellipse", "polyline_buffer"]),
  x: z.number().optional(), y: z.number().optional(),
  w: z.number().optional(), h: z.number().optional(),
  width: z.number().optional(), points: z.array(TileCoord).optional(),
  tags: z.array(z.string()).optional(),
});

const Building = z.object({
  id: z.string(), type: z.literal("building"), name: z.string(),
  footprint: z.object({ shape: z.literal("rect"), x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  entrance: z.object({ x: z.number(), y: z.number(),
    direction: z.enum(["north", "south", "east", "west"]).optional() }),
  interiorMapId: z.string().nullable().optional(),
  activities: z.array(z.string()).optional(),
});

const Bridge = z.object({
  id: z.string(), type: z.literal("bridge"), tiles: z.array(TileCoord),
  connects: z.array(z.string()).optional(), overridesCollision: z.boolean().optional(),
});

const Prop = z.object({
  id: z.string(), type: z.literal("prop"), name: z.string().optional(),
  x: z.number(), y: z.number(), tags: z.array(z.string()).optional(),
});

const POI = z.object({
  id: z.string(), name: z.string(), type: z.string(), x: z.number(), y: z.number(),
  activities: z.array(z.string()).optional(), priority: z.number().optional(),
  ownerNpcId: z.string().optional(),
});

const Spawn = z.object({ id: z.string(), npcId: z.string(), x: z.number(), y: z.number() });

const Legend = z.object({ color: z.string(), walkable: z.boolean(), movementCost: z.number() });

const MapIRSchema = z.object({
  schemaVersion: z.string(), mapId: z.string(), name: z.string(),
  tileSize: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive(),
  legend: z.record(z.string(), Legend),
  layers: z.object({
    base_terrain: z.array(TerrainShape).min(1),
    water: z.array(TerrainShape).optional(),
    mountains: z.array(TerrainShape).optional(),
    cliffs: z.array(TerrainShape).optional(),
    roads: z.array(TerrainShape).optional(),
    bridges: z.array(Bridge).optional(),
    village_ground: z.array(TerrainShape).optional(),
    farm: z.array(TerrainShape).optional(),
    vegetation: z.array(TerrainShape).optional(),
    buildings: z.array(Building).optional(),
    props: z.array(Prop).optional(),
    poi: z.array(POI).optional(),
    spawns: z.array(Spawn).optional(),
  }),
});

/** Validate raw (parsed) JSON into a MapIR. Throws ZodError on structural problems. */
export function parseMapIR(raw: unknown): MapIR {
  return MapIRSchema.parse(raw) as MapIR;
}

/** Fetch a MapIR JSON URL (browser) and validate it. */
export async function loadMapIR(url: string): Promise<MapIR> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load MapIR ${url}: ${res.status}`);
  return parseMapIR(await res.json());
}
