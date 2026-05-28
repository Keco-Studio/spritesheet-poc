import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Manifest } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function emitPreview(outDir: string, manifest: Manifest): string {
  const templatePath = join(__dirname, "template.html");
  const template = readFileSync(templatePath, "utf8");
  const html = template.replace(
    "__MANIFEST_JSON__",
    JSON.stringify(manifest).replace(/</g, "\\u003c"),
  );
  const outPath = join(outDir, "preview.html");
  writeFileSync(outPath, html, "utf8");
  return outPath;
}
