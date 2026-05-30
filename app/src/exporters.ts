import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { buildCollisionExport } from "../../src/core/scene-collision.js";
import { serializeProject, parseProject, type Project } from "../../src/core/project-model.js";
import { collisionMaskBlob, compositeBlob } from "./collision-canvas.js";

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCollision(store: Store, lib: LoadedLibrary): Promise<void> {
  const { mapW, mapH, placements } = store.state;
  const json = buildCollisionExport(mapW, mapH, placements, lib.lookup);
  download("collision.json", new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
  const mask = await collisionMaskBlob(store, lib);
  await new Promise((r) => setTimeout(r, 150)); // let the first download start before the second
  download("collision.png", mask);
}

export async function exportComposite(store: Store, lib: LoadedLibrary): Promise<void> {
  download("map-composited.png", await compositeBlob(store, lib));
}

export function exportProject(store: Store): void {
  const { baseMapDataUrl, mapW, mapH, placements } = store.state;
  if (!baseMapDataUrl) { alert("Load a base map first."); return; }
  const project: Project = { baseMap: baseMapDataUrl, mapW, mapH, placements };
  download("project.json", new Blob([serializeProject(project)], { type: "application/json" }));
}

export async function loadProjectFile(store: Store, file: File): Promise<void> {
  const project = parseProject(await file.text());
  store.update({
    baseMapDataUrl: project.baseMap,
    mapW: project.mapW,
    mapH: project.mapH,
    placements: project.placements,
    selectedIndex: null,
  });
}

/** Read an image File into a data URL + its pixel dimensions. */
export async function readMapFile(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const dataUrl = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { dataUrl, w: img.naturalWidth, h: img.naturalHeight };
}
