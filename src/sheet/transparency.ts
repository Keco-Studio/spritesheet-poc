import sharp from "sharp";

/**
 * Make a sprite's flat background transparent.
 *
 * PixelLab's character/animation frames come back on a flat, opaque backdrop
 * (e.g. mid-gray #808080) that is never auto-removed. We can't just color-key
 * it: the character's own shadow tones often land within tolerance of the
 * background and would get punched out. Instead we FLOOD-FILL inward from the
 * image border, clearing only background-colored pixels that are actually
 * connected to the edge — interior shadows stay opaque.
 *
 * The background color is sampled from the corners (defaults work for the gray
 * PixelLab uses, but any flat corner color is handled). Returns a PNG buffer.
 */
export async function removeFlatBackground(
  png: Buffer,
  opts: { tolerance?: number } = {},
): Promise<Buffer> {
  const tolerance = opts.tolerance ?? 32;

  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) return png; // unexpected; leave untouched

  // Sample the background color from the four corners (majority vote by
  // nearest-cluster is overkill — corners are virtually always the backdrop).
  const corner = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const bg = corner(0, 0);

  const matches = (i: number): boolean =>
    Math.abs(data[i] - bg[0]) <= tolerance &&
    Math.abs(data[i + 1] - bg[1]) <= tolerance &&
    Math.abs(data[i + 2] - bg[2]) <= tolerance;

  // BFS flood fill from every border pixel.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const pushIfBg = (x: number, y: number) => {
    const p = y * width + x;
    if (visited[p]) return;
    if (matches(p * 4)) {
      visited[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop()!;
    data[p * 4 + 3] = 0; // clear alpha
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) pushIfBg(x - 1, y);
    if (x < width - 1) pushIfBg(x + 1, y);
    if (y > 0) pushIfBg(x, y - 1);
    if (y < height - 1) pushIfBg(x, y + 1);
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
