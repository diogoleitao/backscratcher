import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, openConfig, resolveConfigPath } from "./config.js";

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "backscratcher-config-"));
  configPath = path.join(dir, "nested", "config.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeConfigFile(contents: string) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, contents);
}

describe("openConfig", () => {
  it("reads a missing file as empty settings", async () => {
    expect(await openConfig(configPath).settings()).toEqual({});
  });

  it("persists set values across instances, creating the parent directory", async () => {
    await openConfig(configPath).set("port", 5050);
    await openConfig(configPath).set("open", false);
    expect(await openConfig(configPath).settings()).toEqual({
      port: 5050,
      open: false,
    });
  });

  it("unsets a value, leaving the others", async () => {
    await openConfig(configPath).set("port", 5050);
    await openConfig(configPath).set("open", false);
    await openConfig(configPath).unset("port");
    expect(await openConfig(configPath).settings()).toEqual({ open: false });
  });

  it("rejects an invalid value in the file, naming the file, setting and value", async () => {
    await writeConfigFile(JSON.stringify({ settings: { port: "abc" } }));

    const read = openConfig(configPath).settings();
    await expect(read).rejects.toThrow(ConfigError);
    await expect(read).rejects.toThrow(configPath);
    await expect(read).rejects.toThrow(/port.*"abc"/);
  });

  it("rejects a file that is not valid JSON, naming the file", async () => {
    await writeConfigFile("{ not json");

    const read = openConfig(configPath).settings();
    await expect(read).rejects.toThrow(ConfigError);
    await expect(read).rejects.toThrow(`${configPath} is not valid JSON`);
  });
});

describe("resolveConfigPath", () => {
  it("defaults to ~/.config/backscratcher/config.json", () => {
    expect(resolveConfigPath({ home: "/home/dev" })).toBe(
      "/home/dev/.config/backscratcher/config.json",
    );
  });

  it("uses BACKSCRATCHER_CONFIG over the default", () => {
    expect(
      resolveConfigPath({ home: "/home/dev", envPath: "/etc/bs.json" }),
    ).toBe("/etc/bs.json");
  });

  it("uses the --config flag over BACKSCRATCHER_CONFIG", () => {
    expect(
      resolveConfigPath({
        home: "/home/dev",
        envPath: "/etc/bs.json",
        flagPath: "/tmp/flag.json",
      }),
    ).toBe("/tmp/flag.json");
  });
});
