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
import {
  AlreadyRegisteredError,
  openRegistry,
  type Registry,
  RegistryError,
  resolveProjectPath,
} from "./registry.ts";

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

  it("rejects adding a path under a file or through a symlink loop", async () => {
    await writeFile(path.join(dir, "file.txt"), "");
    await symlink(path.join(dir, "loop"), path.join(dir, "loop"));

    for (const target of [path.join(dir, "file.txt", "sub"), path.join(dir, "loop")]) {
      await expect(openRegistry(configPath).add(target)).rejects.toThrow(
        new RegistryError(`${target} is not a directory`),
      );
    }
  });

  it("removes a Project whose parent folder became a file", async () => {
    const parent = path.join(dir, "projects");
    await openRegistry(configPath).add(projectDir);
    await rm(parent, { recursive: true });
    await writeFile(parent, "");

    expect(await openRegistry(configPath).remove(projectDir)).toBe(projectDir);
    expect(await openRegistry(configPath).list()).toEqual([]);
  });

  it("rejects a config file that lists a Project twice, without rewriting it", async () => {
    const contents = JSON.stringify({ projects: [{ path: projectDir }, { path: projectDir }] });
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, contents);

    await expect(openRegistry(configPath).list()).rejects.toThrow(
      new ConfigError(`config file ${configPath}: projects lists ${projectDir} more than once`),
    );
    await expect(openRegistry(configPath).add(projectDir)).rejects.toThrow(ConfigError);
    expect(await readFile(configPath, "utf8")).toBe(contents);
  });

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

  describe("Tracker folder override", () => {
    it("sets a Project's override and persists it across instances", async () => {
      await openRegistry(configPath).add(projectDir);

      expect(await openRegistry(configPath).setTrackerFolder(projectDir, "docs/tickets")).toBe(
        projectDir,
      );
      expect(await openRegistry(configPath).list()).toEqual([
        { path: projectDir, trackerFolder: "docs/tickets" },
      ]);
    });

    it("adds a Project with an override", async () => {
      expect(
        await openRegistry(configPath).add(projectDir, { trackerFolder: "docs/tickets" }),
      ).toEqual({ path: projectDir, added: true });
      expect(await openRegistry(configPath).list()).toEqual([
        { path: projectDir, trackerFolder: "docs/tickets" },
      ]);
    });

    it("rejects adding a registered Project with an override, keeping its override", async () => {
      await openRegistry(configPath).add(projectDir, { trackerFolder: "kept" });

      const again = openRegistry(configPath).add(projectDir, { trackerFolder: "docs/tickets" });
      await expect(again).rejects.toThrow(AlreadyRegisteredError);
      await expect(again).rejects.toThrow(`${projectDir} is already a registered Project`);
      expect(await openRegistry(configPath).list()).toEqual([
        { path: projectDir, trackerFolder: "kept" },
      ]);
    });

    it("rejects adding a Project with an override outside it, without writing", async () => {
      await expect(
        openRegistry(configPath).add(projectDir, { trackerFolder: "../elsewhere" }),
      ).rejects.toThrow(RegistryError);
      await expect(access(configPath)).rejects.toThrow();
    });

    it("clears a Project's override, leaving the other Projects' overrides", async () => {
      const other = path.join(dir, "projects", "other");
      await mkdir(other);
      await openRegistry(configPath).add(projectDir);
      await openRegistry(configPath).add(other);
      await openRegistry(configPath).setTrackerFolder(projectDir, "docs/tickets");
      await openRegistry(configPath).setTrackerFolder(other, "tickets");

      expect(await openRegistry(configPath).clearTrackerFolder(projectDir)).toBe(projectDir);

      expect(await openRegistry(configPath).list()).toEqual([
        { path: projectDir },
        { path: other, trackerFolder: "tickets" },
      ]);
    });

    it("accepts an override that stays inside the Project after normalising", async () => {
      await openRegistry(configPath).add(projectDir);

      await openRegistry(configPath).setTrackerFolder(projectDir, "docs/../tickets");

      expect(await openRegistry(configPath).list()).toEqual([
        { path: projectDir, trackerFolder: "docs/../tickets" },
      ]);
    });

    it.each([
      ["setting", (registry: Registry) => registry.setTrackerFolder(projectDir, "docs")],
      ["clearing", (registry: Registry) => registry.clearTrackerFolder(projectDir)],
    ])("rejects %s the override of a path that is not a registered Project", async (_, change) => {
      await expect(change(openRegistry(configPath))).rejects.toThrow(
        new RegistryError(`${projectDir} is not a registered Project`),
      );
      await expect(access(configPath)).rejects.toThrow();
    });

    it.each([
      [""],
      ["."],
      ["./"],
      [".//"],
      ["docs/.."],
      ["docs/../"],
      [".."],
      ["../"],
      ["../elsewhere"],
      ["docs/../../elsewhere"],
      ["/etc"],
    ])(
      "rejects the override %j, which is not a folder inside the Project, without writing",
      async (trackerFolder) => {
        await openRegistry(configPath).add(projectDir);

        await expect(
          openRegistry(configPath).setTrackerFolder(projectDir, trackerFolder),
        ).rejects.toThrow(
          new RegistryError(
            `invalid Tracker folder ${JSON.stringify(trackerFolder)} (expected a relative path to a folder inside the Project)`,
          ),
        );
        expect(await openRegistry(configPath).list()).toEqual([{ path: projectDir }]);
      },
    );

    it.each([['""'], ["1"], ["null"], ['"/etc"'], ['"../elsewhere"']])(
      "rejects a stored override of %s, without rewriting the file",
      async (trackerFolder) => {
        const contents = `{"projects":[{"path":${JSON.stringify(projectDir)},"trackerFolder":${trackerFolder}}]}`;
        await mkdir(path.dirname(configPath), { recursive: true });
        await writeFile(configPath, contents);

        await expect(openRegistry(configPath).list()).rejects.toThrow(
          new ConfigError(
            `config file ${configPath}: the trackerFolder of ${projectDir} must be a relative path to a folder inside the Project`,
          ),
        );
        await expect(
          openRegistry(configPath).setTrackerFolder(projectDir, "docs"),
        ).rejects.toThrow(ConfigError);
        expect(await readFile(configPath, "utf8")).toBe(contents);
      },
    );
  });

  it("rejects removing a path that is not a registered Project", async () => {
    await openRegistry(configPath).add(projectDir);

    await expect(openRegistry(configPath).remove(path.join(dir, "nope"))).rejects.toThrow(
      new RegistryError(`${path.join(dir, "nope")} is not a registered Project`),
    );
    expect(await openRegistry(configPath).list()).toEqual([{ path: projectDir }]);
  });
});
