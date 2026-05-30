import type { Placement } from "../../src/sheet/scene-collision.js";

export type Mode = "edit" | "play";

export type EditorState = {
  mode: Mode;
  baseMapDataUrl: string | null;
  mapW: number;
  mapH: number;
  placements: Placement[];
  activeAssetId: string | null; // selected palette asset to place
  selectedIndex: number | null; // selected placed instance
  showCollision: boolean;
};

export function createStore() {
  const state: EditorState = {
    mode: "edit",
    baseMapDataUrl: null,
    mapW: 0,
    mapH: 0,
    placements: [],
    activeAssetId: null,
    selectedIndex: null,
    showCollision: false,
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    state,
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
    update(patch: Partial<EditorState>) { Object.assign(state, patch); emit(); },
    addPlacement(p: Placement) { state.placements.push(p); emit(); },
    movePlacement(i: number, x: number, y: number) { state.placements[i].x = x; state.placements[i].y = y; emit(); },
    removePlacement(i: number) { state.placements.splice(i, 1); state.selectedIndex = null; emit(); },
  };
}
export type Store = ReturnType<typeof createStore>;
