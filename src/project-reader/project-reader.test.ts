import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { type PrLookup, readProject } from "./project-reader.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const noPrs: PrLookup = async () => [];

type Entry = { path: string; mtimeMs: number; contents?: string };

async function snapshot(root: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const name of await readdir(root, { recursive: true })) {
    const entryPath = path.join(root, name);
    const info = await lstat(entryPath);
    entries.push({
      path: name,
      mtimeMs: info.mtimeMs,
      contents: info.isFile() ? await readFile(entryPath, "utf8") : undefined,
    });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function readFixture(name: string, trackerFolder?: string) {
  return readUntouched(path.join(fixtures, name), trackerFolder);
}

async function readUntouched(projectPath: string, trackerFolder?: string) {
  const before = await snapshot(projectPath);
  const model = await readProject(projectPath, { trackerFolder, prLookup: noPrs });
  expect(await snapshot(projectPath)).toEqual(before);
  return { projectPath, model };
}

describe("readProject", () => {
  it("lists a directory in the Tracker folder that contains spec.md as a Feature", async () => {
    const { projectPath, model } = await readFixture("feature-with-spec");

    expect(model).toEqual({
      trackerFolder: { path: path.join(projectPath, ".scratch"), exists: true },
      features: [
        {
          slug: "checkout",
          spec: { source: "# Checkout\n\nLet a shopper pay for the items in their cart.\n" },
        },
      ],
      skipped: [],
    });
  });

  it("skips a directory without spec.md and without issues/", async () => {
    const { model } = await readFixture("no-spec-no-issues");

    expect(model.features).toEqual([]);
    expect(model.skipped).toEqual(["notes"]);
  });

  it("skips a directory without spec.md that has issues/, and ignores loose files", async () => {
    const { model } = await readFixture("no-spec-with-issues");

    expect(model.features).toEqual([]);
    expect(model.skipped).toEqual(["legacy"]);
  });

  it("lists Features and skipped directories in name order", async () => {
    const { model } = await readFixture("several-directories");

    expect(model.features.map((feature) => feature.slug)).toEqual(["checkout", "search"]);
    expect(model.skipped).toEqual(["archive", "zeta"]);
  });

  it("skips a directory whose spec.md is a folder", async () => {
    const { model } = await readFixture("spec-is-directory");

    expect(model.features).toEqual([]);
    expect(model.skipped).toEqual(["odd"]);
  });

  it("reads the Tracker folder the setting names, relative to the Project", async () => {
    const { projectPath, model } = await readFixture("custom-tracker-folder", "docs/tickets");

    expect(model).toEqual({
      trackerFolder: { path: path.join(projectPath, "docs", "tickets"), exists: true },
      features: [{ slug: "billing", spec: { source: "# Billing\n" } }],
      skipped: [],
    });
  });

  it("reports a missing Tracker folder as an empty Project", async () => {
    const { projectPath, model } = await readFixture("no-tracker-folder");

    expect(model).toEqual({
      trackerFolder: { path: path.join(projectPath, ".scratch"), exists: false },
      features: [],
      skipped: [],
    });
  });

  it("reports a Tracker folder path that is a file as missing", async () => {
    const { model } = await readFixture("tracker-folder-is-file");

    expect(model.trackerFolder.exists).toBe(false);
    expect(model.features).toEqual([]);
  });

  describe("with symlinks in the Tracker folder", () => {
    let dir: string;

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("follows a symlinked Feature directory and ignores a dangling symlink", async () => {
      dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-reader-")));
      const elsewhere = path.join(dir, "elsewhere", "search");
      await mkdir(elsewhere, { recursive: true });
      await writeFile(path.join(elsewhere, "spec.md"), "# Search\n");
      const projectPath = path.join(dir, "project");
      await mkdir(path.join(projectPath, ".scratch"), { recursive: true });
      await symlink(elsewhere, path.join(projectPath, ".scratch", "search"));
      await symlink(path.join(dir, "gone"), path.join(projectPath, ".scratch", "dangling"));

      const { model } = await readUntouched(projectPath);

      expect(model.features).toEqual([{ slug: "search", spec: { source: "# Search\n" } }]);
      expect(model.skipped).toEqual([]);
    });
  });
});
