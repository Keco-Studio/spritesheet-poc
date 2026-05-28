import sharp from "sharp";
import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";
import { DIRECTIONS_8 } from "../types.js";

type Resp = { images: Record<string, { type: "base64"; base64: string }> };

export async function generate8Directions(
  client: PixelLabClient,
  description: string,
  size: number,
): Promise<Record<string, string>> {
  const resp = await client.post<Resp>("/create-character-with-8-directions", {
    description,
    image_size: { width: size, height: size },
  });
  const out: Record<string, string> = {};
  for (const dir of DIRECTIONS_8) {
    const raw = resp.images?.[dir]?.base64;
    if (!raw) throw new PixelLabError(`8-dir response missing ${dir}`);
    const b64 = raw.startsWith("data:") ? raw.split(",")[1] : raw;
    const resized = await sharp(Buffer.from(b64, "base64"))
      .resize(size, size, { kernel: "nearest" })
      .png()
      .toBuffer();
    out[dir] = resized.toString("base64");
  }
  return out;
}
