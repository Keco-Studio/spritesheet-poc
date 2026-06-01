import type { CompiledMap, TerrainLegend } from "./types.js";

export interface RenderOpts { tilePx?: number; legend?: Record<string, TerrainLegend>; coords?: boolean; }

const FALLBACK = "#cccccc";

/** Deterministically draw the compiled map onto a 2D canvas context. */
export function renderSemanticMap(ctx: CanvasRenderingContext2D, map: CompiledMap, opts: RenderOpts = {}): void {
  const tile = opts.tilePx ?? 16;
  const legend = opts.legend ?? {};
  ctx.canvas.width = map.width * tile;
  ctx.canvas.height = map.height * tile;

  // terrain tiles
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      ctx.fillStyle = legend[map.terrain[y][x]]?.color ?? FALLBACK;
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }
  }
  // grid
  ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 1;
  for (let y = 0; y <= map.height; y++) { ctx.beginPath(); ctx.moveTo(0, y * tile); ctx.lineTo(map.width * tile, y * tile); ctx.stroke(); }
  for (let x = 0; x <= map.width; x++) { ctx.beginPath(); ctx.moveTo(x * tile, 0); ctx.lineTo(x * tile, map.height * tile); ctx.stroke(); }

  // objects: buildings (dark outline), bridges (brown), doors (red)
  for (const o of map.objects) {
    if (o.kind === "building") {
      ctx.strokeStyle = "#5b3a29"; ctx.lineWidth = 2;
      for (const [x, y] of o.tiles) ctx.strokeRect(x * tile, y * tile, tile, tile);
    } else if (o.kind === "bridge") {
      ctx.fillStyle = "#9c6b3f";
      for (const [x, y] of o.tiles) ctx.fillRect(x * tile, y * tile, tile, tile);
    } else if (o.kind === "door") {
      ctx.fillStyle = "#d12c2c";
      for (const [x, y] of o.tiles) ctx.fillRect(x * tile + tile * 0.25, y * tile + tile * 0.25, tile * 0.5, tile * 0.5);
    }
  }

  // POI markers: purple diamonds
  ctx.fillStyle = "#8e24aa";
  for (const p of map.pois) {
    const cx = p.x * tile + tile / 2, cy = p.y * tile + tile / 2, r = tile * 0.4;
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
  }
  // spawn markers: orange circles
  ctx.fillStyle = "#fb8c00";
  for (const s of map.spawns) {
    ctx.beginPath(); ctx.arc(s.x * tile + tile / 2, s.y * tile + tile / 2, tile * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  if (opts.coords) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.font = `${Math.max(6, tile * 0.4)}px monospace`;
    for (let x = 0; x < map.width; x += 5) ctx.fillText(String(x), x * tile + 1, tile * 0.5);
  }
}
