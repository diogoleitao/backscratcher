import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openConfig } from "../config/config.ts";
import { ConfigError } from "../config/file.ts";
import { openRegistry, RegistryError, resolveProjectPath } from "./registry.ts";

let dir: string;
let configPath: string;
let projectDir: string;

beforeEach(async () => {
  // Real path, so expected paths match the registry's canonical ones.
  dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-registry-")));
  configPath = path.join(dir, "config", "config.json");
  projectDir = path.join(dir, "projects", "app");
  await mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolveProjectPath", () => {
  it("resolves a path relative to the working directory", () => {
    expect(resolveProjectPath("/work", "app/")).toBe("/work/app");
  });

  it("defaults to the working directory", () => {
    expect(resolveProjectPath("/work")).toBe("/work");
  });
});

describe("openRegistry", () => {
  it("adds a Project and lists it", async () => {
    const registry = openRegistry(configPath);

    expect(await registry.add(projectDir)).toEqual({ path: projectDir, added: true });
    expect(await registry.list()).toEqual([{ path: projectDir }]);
  });

  it("adds the working directory", async () => {
    const registry = openRegistry(configPath);

    expect(await registry.add(resolveProjectPath(projectDir))).toEqual({
      path: projectDir,
      added: true,
    });
    expect(await registry.list()).toEqual([{ path: projectDir }]);
  });

  it("persists Projects across instances reading the same config file", async () => {
    await openRegistry(configPath).add(projectDir);

    expect(await openRegistry(configPath).list()).toEqual([{ path: projectDir }]);
  });

  it("does not duplicate a Project added again from another directory", async () => {
    await openRegistry(configPath).add(resolveProjectPath(projectDir));
    const again = await openRegistry(configPath).add(
      resolveProjectPath(dir, "projects/app/"),
    );

    expect(again).toEqual({ path: projectDir, added: false });
    expect(await openRegistry(configPath).list()).toEqual([{ path: projectDir }]);
  });

  it("treats a folder reached through a symlink as the same Project", async () => {
    const link = path.join(dir, "link");
    await symlink(projectDir, link);
    await openRegistry(configPath).add(projectDir);

    expect(await openRegistry(configPath).add(link)).toEqual({
      path: projectDir,
      added: false,
    });
    expect(await openRegistry(configPath).remove(link)).toBe(projectDir);
    expect(await openRegistry(configPath).list()).toEqual([]);
  });

  it.each([["missing"], ["file.txt"]])(
    "rejects adding %s, which is not a directory, without writing",
    async (target) => {
      await writeFile(path.join(dir, "file.txt"), "");

      await expect(openRegistry(configPath).add(path.join(dir, target))).rejects.toThrow(
        new RegistryError(`${path.join(dir, target)} is not a directory`),
      );
      await expect(access(configPath)).rejects.toThrow();
    },
  );

  it.each([['"ab"'], ["null"], ["{}"], ["[1]"], ['[{"path":1}]'], ['[{"path":"relative"}]']])(
    "rejects projects that are %s, without rewriting the file",
    async (projects) => {
      const contents = `{"projects":${projects}}`;
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(configPath, contents);
      const registry = openRegistry(configPath);

      await expect(registry.list()).rejects.toThrow(
        new ConfigError(
          `config file ${configPath}: projects must be a list of {"path": "<absolute path>"}`,
        ),
      );
      await expect(registry.add(projectDir)).rejects.toThrow(ConfigError);
      expect(await readFile(configPath, "utf8")).toBe(contents);
    },
  );

  it("keeps the settings in the config file when adding a Project", async () => {
    await openConfig(configPath).set("port", 5050);
    await openRegistry(configPath).add(projectDir);

    expect(await openConfig(configPath).settings()).toEqual({ port: 5050 });
  });

  it("removes a Project, leaving the others", async () => {
    const other = path.join(dir, "projects", "other");
    await mkdir(other);
    await openRegistry(configPath).add(other);
    await openRegistry(configPath).add(projectDir);

    expect(await openRegistry(configPath).remove(projectDir)).toBe(projectDir);
    expect(await openRegistry(configPath).list()).toEqual([{ path: other }]);
  });

  it("removes a Project whose folder no longer exists", async () => {
    await openRegistry(configPath).add(projectDir);
    await rm(projectDir, { recursive: true });

    expect(await openRegistry(configPath).remove(projectDir)).toBe(projectDir);
    expect(await openRegistry(configPath).list()).toEqual([]);
  });

  it("rejects removing a path that is not a registered Project", async () => {
    await openRegistry(configPath).add(projectDir);

    await expect(openRegistry(configPath).remove(path.join(dir, "nope"))).rejects.toThrow(
      new RegistryError(`${path.join(dir, "nope")} is not a registered Project`),
    );
    expect(await openRegistry(configPath).list()).toEqual([{ path: projectDir }]);
  });
});
