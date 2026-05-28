import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config.js";

const valid = {
  name: "knight",
  description: "a knight",
  size: 64,
  actions: [
    { name: "idle", prompt: "still", frames: 4 },
    { name: "walk", prompt: "walking", frames: 8 },
  ],
};

describe("parseConfig", () => {
  it("accepts a valid config", () => {
    expect(parseConfig(valid)).toEqual(valid);
  });

  it("rejects missing name", () => {
    const { name, ...rest } = valid;
    expect(() => parseConfig(rest)).toThrow(/name/);
  });

  it("rejects size != 64", () => {
    expect(() => parseConfig({ ...valid, size: 32 })).toThrow(/size/);
  });

  it("rejects frames out of range", () => {
    const bad = { ...valid, actions: [{ name: "idle", prompt: "x", frames: 20 }] };
    expect(() => parseConfig(bad)).toThrow(/frames/);
  });

  it("rejects duplicate action names", () => {
    const bad = {
      ...valid,
      actions: [
        { name: "idle", prompt: "x", frames: 4 },
        { name: "idle", prompt: "y", frames: 4 },
      ],
    };
    expect(() => parseConfig(bad)).toThrow(/duplicate/i);
  });

  it("rejects empty actions list", () => {
    expect(() => parseConfig({ ...valid, actions: [] })).toThrow();
  });
});
