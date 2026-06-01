import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMapIR } from "../../src/mapcompiler/loadMapIR.js";
import { compile } from "../../src/mapcompiler/compile.js";

describe("bundled sample map", () => {
  it("parses and compiles with validation.ok", () => {
    const raw = readFileSync(join(process.cwd(), "app/public/maps/mountain_river_village.json"), "utf8");
    const compiled = compile(parseMapIR(JSON.parse(raw)));
    if (!compiled.validation.ok) console.error(JSON.stringify(compiled.validation.errors, null, 2));
    expect(compiled.validation.ok).toBe(true);
    expect(compiled.width).toBeGreaterThan(0);
    expect(compiled.spawns.length).toBe(3);
  });
});
