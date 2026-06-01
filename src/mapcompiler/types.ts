export type TileCoord = [number, number]; // [x, y]

// ---- MapIR (input) ---------------------------------------------------------
export interface MapIR {
  schemaVersion: string;
  mapId: string;
  name: string;
  tileSize: number;
  width: number;
  height: number;
  legend: Record<string, TerrainLegend>;
  layers: MapLayers;
}

export interface TerrainLegend {
  color: string;
  walkable: boolean;
  movementCost: number;
}

export interface MapLayers {
  base_terrain: TerrainShape[];
  water?: TerrainShape[];
  mountains?: TerrainShape[];
  cliffs?: TerrainShape[];
  roads?: TerrainShape[];
  bridges?: BridgeObject[];
  village_ground?: TerrainShape[];
  farm?: TerrainShape[];
  vegetation?: TerrainShape[];
  buildings?: BuildingObject[];
  props?: PropObject[];
  poi?: POIObject[];
  spawns?: SpawnObject[];
}

export type ShapeKind = "rect" | "polygon" | "ellipse" | "polyline_buffer";

export interface TerrainShape {
  id: string;
  type: string;           // e.g. "water", "mountain", "road", "forest", "plaza", "farm"
  terrain?: string;       // overrides `type` as the legend key if present
  shape: ShapeKind;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;         // polyline_buffer stroke width (tiles)
  points?: TileCoord[];   // polygon / polyline vertices
  tags?: string[];
}

export interface BuildingObject {
  id: string;
  type: "building";
  name: string;
  footprint: { shape: "rect"; x: number; y: number; w: number; h: number };
  entrance: { x: number; y: number; direction?: "north" | "south" | "east" | "west" };
  interiorMapId?: string | null;
  activities?: string[];
}

export interface BridgeObject {
  id: string;
  type: "bridge";
  tiles: TileCoord[];
  connects?: string[];
  overridesCollision?: boolean;
}

export interface PropObject {
  id: string;
  type: "prop";
  name?: string;
  x: number;
  y: number;
  tags?: string[];
}

export interface POIObject {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  activities?: string[];
  priority?: number;
  ownerNpcId?: string;
}

export interface SpawnObject {
  id: string;
  npcId: string;
  x: number;
  y: number;
}

// ---- CompiledMap (output) --------------------------------------------------
export type CompiledObjectKind = "building" | "bridge" | "door" | "prop";

export interface CompiledObject {
  id: string;
  kind: CompiledObjectKind;
  name?: string;
  tiles: TileCoord[];     // tiles this object occupies (footprint / bridge tiles / door tile)
  meta?: Record<string, unknown>;
}

export interface NavNode { id: string; x: number; y: number; walkable: boolean; cost: number; }
export interface NavEdge { from: string; to: string; cost: number; }
export interface NavGraph { nodes: NavNode[]; edges: NavEdge[]; }

export interface ValidationIssue {
  rule: string;
  severity: "error" | "warning";
  message: string;
  tile?: TileCoord;
  objectId?: string;
}
export interface ValidationReport { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[]; }

export interface CompiledMap {
  mapId: string;
  name: string;
  tileSize: number;
  width: number;
  height: number;
  terrain: string[][];        // [y][x] legend key
  collision: boolean[][];     // [y][x] true = blocked
  walkable: boolean[][];      // [y][x] = !collision
  movementCost: number[][];   // [y][x]
  objects: CompiledObject[];
  pois: POIObject[];
  spawns: SpawnObject[];
  navGraph: NavGraph;
  validation: ValidationReport;
}
