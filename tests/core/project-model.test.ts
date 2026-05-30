import { describe, it, expect } from "vitest";
import { serializeProject, parseProject } from "../../src/core/project-model.js";

const project = {
  baseMap: "data:image/png;base64,AAAA",
  mapW: 256,
  mapH: 256,
  placements: [{ assetId: "tree", x: 10, y: 20 }],
};

describe("project round-trip", () => {
  it("serialize then parse yields the same project", () => {
    const json = serializeProject(project);
    expect(parseProject(json)).toEqual(project);
  });
  it("rejects malformed JSON", () => {
    expect(() => parseProject("{not json")).toThrow();
  });
  it("rejects a project missing mapW", () => {
    expect(() => parseProject(JSON.stringify({ baseMap: "x", mapH: 1, placements: [] }))).toThrow();
  });
});
