import { Scene, Actor, Vector, ImageSource, Color, Rectangle, Circle, Engine, Keys } from "excalibur";
import type { Store } from "./store.js";
import type { LoadedLibrary } from "./assets.js";
import { colliders } from "../../src/sheet/scene-collision.js";

export class EditorScene extends Scene {
  private store: Store;
  private lib: LoadedLibrary;
  private baseActor: Actor | null = null;
  private baseMapUrl: string | null = null;
  private placementActors: Actor[] = [];
  private overlayActors: Actor[] = [];

  constructor(store: Store, lib: LoadedLibrary) {
    super();
    this.store = store;
    this.lib = lib;
  }

  onInitialize(engine: Engine): void {
    // Place active asset on empty space; select a placed asset on hit.
    engine.input.pointers.primary.on("down", (evt) => {
      if (this.store.state.mode !== "edit") return;
      const wp = evt.worldPos;
      const hit = this.hitTest(wp.x, wp.y);
      if (hit !== null) {
        this.store.update({ selectedIndex: hit });
      } else if (this.store.state.activeAssetId) {
        this.store.addPlacement({ assetId: this.store.state.activeAssetId, x: wp.x, y: wp.y });
      }
    });

    // Drag selected placement while the primary button is held.
    engine.input.pointers.primary.on("move", (evt) => {
      if (this.store.state.mode !== "edit") return;
      const i = this.store.state.selectedIndex;
      const ne = evt.nativeEvent as MouseEvent;
      if (i !== null && ne instanceof MouseEvent && ne.buttons === 1) {
        this.store.movePlacement(i, evt.worldPos.x, evt.worldPos.y);
      }
    });

    engine.input.keyboard.on("press", (evt) => {
      if (this.store.state.mode !== "edit") return;
      if ((evt.key === Keys.Delete || evt.key === Keys.Backspace) && this.store.state.selectedIndex !== null) {
        this.store.removePlacement(this.store.state.selectedIndex);
      }
    });

    // Wheel zoom.
    engine.canvas.addEventListener("wheel", (e) => {
      if (this.store.state.mode !== "edit") return;
      e.preventDefault();
      const cam = this.camera;
      cam.zoom = Math.max(0.5, Math.min(8, cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    }, { passive: false });

    // Middle-mouse drag to pan (so large maps are reachable under zoom).
    let panning = false;
    let last = { x: 0, y: 0 };
    engine.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 1 && this.store.state.mode === "edit") { panning = true; last = { x: e.clientX, y: e.clientY }; e.preventDefault(); }
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 1) panning = false; });
    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      if (this.store.state.mode !== "edit") return;
      const dx = (e.clientX - last.x) / this.camera.zoom;
      const dy = (e.clientY - last.y) / this.camera.zoom;
      this.camera.pos = new Vector(this.camera.pos.x - dx, this.camera.pos.y - dy);
      last = { x: e.clientX, y: e.clientY };
    });

    this.store.subscribe(() => this.rebuild());
    this.rebuild();
  }

  /** Returns the index of the topmost placement under (x,y), or null. */
  private hitTest(x: number, y: number): number | null {
    const ps = this.store.state.placements;
    for (let i = ps.length - 1; i >= 0; i--) {
      const e = this.lib.entry(ps[i].assetId);
      const left = ps[i].x - e.w / 2, top = ps[i].y - e.h;
      if (x >= left && x <= left + e.w && y >= top && y <= top + e.h) return i;
    }
    return null;
  }

  /** Rebuild all actors from store state. */
  private rebuild(): void {
    const s = this.store.state;

    // Only kill and recreate the base actor when the data URL has changed; avoids
    // re-decoding the image on every store update (e.g. every mousemove during a drag).
    if (s.baseMapDataUrl !== this.baseMapUrl) {
      if (this.baseActor) { this.baseActor.kill(); this.baseActor = null; }
      this.baseMapUrl = s.baseMapDataUrl ?? null;
      if (s.baseMapDataUrl) {
        const img = new ImageSource(s.baseMapDataUrl);
        const actor = new Actor({ pos: new Vector(0, 0), anchor: new Vector(0, 0), z: -100000 });
        img.load().then(() => actor.graphics.use(img.toSprite()));
        this.add(actor);
        this.baseActor = actor;
        this.camera.pos = new Vector(s.mapW / 2, s.mapH / 2);
      }
    }

    // Placement actors are fully recreated on every store change; acceptable at prototype scale (small placement count).
    for (const a of this.placementActors) a.kill();
    this.placementActors = [];
    s.placements.forEach((p, i) => {
      const e = this.lib.entry(p.assetId);
      const actor = new Actor({ pos: new Vector(p.x, p.y), anchor: new Vector(0.5, 1), z: p.y });
      const sprite = this.lib.images[p.assetId].toSprite();
      // Reconciliation: sprite.destSize is not writable as a plain object assignment in this
      // Excalibur version; use sprite.width / sprite.height setters instead.
      sprite.width = e.w;
      sprite.height = e.h;
      actor.graphics.use(sprite);
      if (i === s.selectedIndex) {
        // Reconciliation: graphics.layers API does not exist in this Excalibur version.
        // Draw the selection outline via a child Actor offset to align with the sprite bounds.
        const outline = new Rectangle({ width: e.w, height: e.h, color: Color.Transparent, strokeColor: Color.fromHex("#4af"), lineWidth: 2 });
        const selActor = new Actor({ pos: new Vector(0, -e.h / 2), z: 1 });
        selActor.graphics.use(outline);
        actor.addChild(selActor);
      }
      this.add(actor);
      this.placementActors[i] = actor;
    });

    for (const a of this.overlayActors) a.kill();
    this.overlayActors = [];
    if (s.showCollision) {
      for (const c of colliders(s.placements, this.lib.lookup)) {
        const a = new Actor({ pos: new Vector(c.cx, c.cy), z: 99999 });
        a.graphics.use(new Circle({ radius: c.rx, color: Color.fromRGB(255, 0, 0, 0.3) }));
        a.scale = new Vector(1, c.ry / c.rx);
        this.add(a);
        this.overlayActors.push(a);
      }
    }
  }
}
