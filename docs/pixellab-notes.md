# PixelLab API Notes

Hard-won behavior of the PixelLab v2 API (`https://api.pixellab.ai/v2`), as used by
this repo. Client: `src/pixellab/client.ts` (`createClient(apiKey)` → `{post, get}`;
throws `PixelLabError` on non-2xx).

## Endpoints

### `/create-image-pixflux` — `src/pixellab/map.ts`, `src/pixellab/object.ts`
- **Synchronous.** One POST returns the finished image inline.
- Image comes back as **base64 PNG** (strip any `data:image/png;base64,` prefix).
- **Size cap: ≤ 400px** per side.
- `object.ts` passes `no_background: true` for transparent sprites, then runs
  `removeFlatBackground` as a safety net.

### `/create-tileset` — `src/pixellab/tileset.ts`
- **Asynchronous.** Poll the job; it resolves when `last_response.type === "message_done"`
  (the `status` field never flips to `"completed"`, so do **not** use a generic
  `waitForJob` that waits on `status`).
- Returns **raw RGBA bytes**, decoded with
  `sharp(buf, { raw: { width, height, channels: 4 } }).png()`.

### `/inpaint` — `src/pixellab/inpaint.ts`
- **Synchronous.**
- **Size cap: ≤ 200px** per side (tighter than pixflux). Callers must guard this.
- `text_guidance_scale`: **max 10** (16 → HTTP 422). The default of 3 is too low for
  discrete objects — **use 8**.
- Mask: **white = regenerate**, black = keep.
- **Name the background in the prompt** (e.g. `"...on a green grass background, top-down"`)
  or the box fills with a dark backdrop instead of blending into the map.

## Gotcha: baked gray backdrop on characters/animations
PixelLab bakes a **flat opaque gray `(128,128,128)`** backdrop into character and
animation frames (it is not transparent). `src/sheet/transparency.ts`
`removeFlatBackground()` removes it with a border BFS flood-fill: it samples the
corner color and clears alpha only on the connected border region, so interior
shadow grays are preserved.
