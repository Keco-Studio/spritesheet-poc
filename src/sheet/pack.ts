import sharp from "sharp";

/**
 * Compose a grid PNG. `rowsFrames[r]` is the array of frame PNG buffers for row r.
 * Short rows are left transparent on the right. All frames must be `frameSize`x`frameSize`.
 */
export async function packSheet(
  frameSize: number,
  columns: number,
  rows: number,
  rowsFrames: Buffer[][],
): Promise<Buffer> {
  const width = frameSize * columns;
  const height = frameSize * rows;

  const composites: sharp.OverlayOptions[] = [];
  for (let r = 0; r < rows; r++) {
    const row = rowsFrames[r];
    for (let c = 0; c < row.length; c++) {
      composites.push({
        input: row[c],
        left: c * frameSize,
        top: r * frameSize,
      });
    }
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
