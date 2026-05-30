import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "core");

// Patterns that would pull a Node/sharp dependency into a browser-bundled file.
const FORBIDDEN: Array<[string, RegExp]> = [
  ["node: import", /from\s+["']node:/],
  ["fs import", /from\s+["']fs["']/],
  ["sharp import", /from\s+["']sharp["']/],
  ["require()", /\brequire\s*\(/],
];

describe("src/core stays browser-safe", () => {
  const files = readdirSync(CORE_DIR).filter((f) => f.endsWith(".ts"));

  it("finds core files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} has no Node/sharp imports`, () => {
      const src = readFileSync(join(CORE_DIR, file), "utf8");
      for (const [label, pattern] of FORBIDDEN) {
        expect(pattern.test(src), `${file} must not contain a ${label}`).toBe(false);
      }
    });
  }
});
