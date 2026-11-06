import { describe, expect, it } from "vitest";
import { defaultConfigPath } from "./config.ts";

describe("defaultConfigPath", () => {
  it("is ~/.config/backscratcher/config.json", () => {
    expect(defaultConfigPath("/home/dev")).toBe("/home/dev/.config/backscratcher/config.json");
  });
});
