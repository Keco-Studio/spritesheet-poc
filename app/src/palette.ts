import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";

/** Render the DOM palette of assets; clicking sets the active asset to place. */
export function mountPalette(container: HTMLElement, store: Store, lib: LoadedLibrary): void {
  container.innerHTML = "";
  const items: Record<string, HTMLElement> = {};
  for (const a of lib.manifest.assets) {
    const el = document.createElement("div");
    el.className = "pal-item";
    el.innerHTML = `<img src="/assets/${a.file}" alt="${a.name}"><div>${a.name}</div>`;
    el.addEventListener("click", () => store.update({ activeAssetId: a.id }));
    container.appendChild(el);
    items[a.id] = el;
  }
  const refresh = () => {
    for (const [id, el] of Object.entries(items)) el.classList.toggle("active", store.state.activeAssetId === id);
  };
  store.subscribe(refresh);
  refresh();
}
