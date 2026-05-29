import type { Store } from "./store.js";

export type ToolbarHandlers = {
  onLoadMap: (file: File) => void;
  onLoadProject: (file: File) => void;
  onExportCollision: () => void;
  onExportComposite: () => void;
  onExportProject: () => void;
};

/** Build the toolbar: load map/project, mode toggle, collision overlay, exports. */
export function mountToolbar(container: HTMLElement, store: Store, h: ToolbarHandlers): void {
  container.innerHTML = "";

  const fileButton = (label: string, accept: string, cb: (f: File) => void) => {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => { if (input.files?.[0]) cb(input.files[0]); input.value = ""; });
    wrap.appendChild(input);
    container.appendChild(wrap);
  };

  const button = (label: string, cb: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", cb);
    container.appendChild(b);
    return b;
  };

  fileButton("Load Map", "image/png,image/*", h.onLoadMap);
  fileButton("Load Project", "application/json,.json", h.onLoadProject);

  const modeBtn = button("Mode: Edit", () => store.update({ mode: store.state.mode === "edit" ? "play" : "edit", selectedIndex: null }));
  const collBtn = button("Collision: off", () => store.update({ showCollision: !store.state.showCollision }));

  button("Export Collision", h.onExportCollision);
  button("Export Map PNG", h.onExportComposite);
  button("Export Project", h.onExportProject);

  const refresh = () => {
    modeBtn.textContent = `Mode: ${store.state.mode === "edit" ? "Edit" : "Play"}`;
    modeBtn.classList.toggle("active", store.state.mode === "play");
    collBtn.textContent = `Collision: ${store.state.showCollision ? "on" : "off"}`;
    collBtn.classList.toggle("active", store.state.showCollision);
  };
  store.subscribe(refresh);
  refresh();
}
