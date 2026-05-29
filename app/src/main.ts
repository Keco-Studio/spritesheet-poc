import { Engine, Color } from "excalibur";
import { loadLibrary } from "./assets.js";
import { createStore } from "./store.js";
import { EditorScene } from "./editor-scene.js";
import { PlayScene } from "./play-scene.js";
import { mountPalette } from "./palette.js";
import { mountToolbar } from "./toolbar.js";
import { exportCollision, exportComposite, exportProject, loadProjectFile, readMapFile } from "./exporters.js";

const lib = await loadLibrary();
const store = createStore();

const game = new Engine({
  canvasElementId: "game",
  width: 960,
  height: 640,
  backgroundColor: Color.fromHex("#0c0c0c"),
  antialiasing: false,
  pixelArt: true,
});

const editor = new EditorScene(store, lib);
const play = new PlayScene(store, lib);
game.addScene("edit", editor);
game.addScene("play", play);
await game.start();
// goToScene returns Promise<void> in Excalibur 0.30.x — fire-and-forget is fine here.
game.goToScene("edit");

// Switch scenes when the mode changes.
// game.currentSceneName is a getter available in Excalibur 0.30.x, so no local
// tracking variable is needed. goToScene is async; we ignore the returned promise
// in the subscribe callback (non-async callback, transition is best-effort).
store.subscribe(() => {
  const target = store.state.mode === "play" ? "play" : "edit";
  if (game.currentSceneName !== target) {
    game.goToScene(target);
  }
});

mountPalette(document.getElementById("palette")!, store, lib);
mountToolbar(document.getElementById("toolbar")!, store, {
  onLoadMap: async (file) => {
    const { dataUrl, w, h } = await readMapFile(file);
    store.update({ baseMapDataUrl: dataUrl, mapW: w, mapH: h, placements: store.state.placements });
    document.getElementById("hint")!.textContent = `Map ${w}×${h}. Pick an asset and click to place. Delete removes. Toggle Mode to play-test.`;
  },
  onLoadProject: (file) => loadProjectFile(store, file),
  onExportCollision: () => exportCollision(store, lib),
  onExportComposite: () => exportComposite(store, lib),
  onExportProject: () => exportProject(store),
});
