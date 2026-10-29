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
  return readUntouched(path.join(fixtures, name), { trackerFolder });
}

async function readUntouched(
  projectPath: string,
  { trackerFolder, root = projectPath }: { trackerFolder?: string; root?: string } = {},
) {
  const before = await snapshot(root);
  const model = await readProject(projectPath, { trackerFolder, prLookup: noPrs });
  expect(await snapshot(root)).toEqual(before);
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
      pages: [],
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

  it("orders names by letter regardless of case", async () => {
    const { model } = await readFixture("mixed-case-names");

    expect(model.features.map((feature) => feature.slug)).toEqual(["alpha", "Zeta"]);
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
      pages: [{ kind: "tracker", path: "docs/tickets/index.md", source: "# Tickets\n" }],
    });
  });

  it("reports a missing Tracker folder as an empty Project", async () => {
    const { projectPath, model } = await readFixture("no-tracker-folder");

    expect(model).toEqual({
      trackerFolder: { path: path.join(projectPath, ".scratch"), exists: false },
      features: [],
      skipped: [],
      pages: [],
    });
  });

  it("reports a Tracker folder path that is a file as missing", async () => {
    const { model } = await readFixture("tracker-folder-is-file");

    expect(model.trackerFolder.exists).toBe(false);
    expect(model.features).toEqual([]);
  });

  describe("Project-level pages", () => {
    it("lists the Project's GLOSSARY.md, even without a Tracker folder", async () => {
      const { model } = await readFixture("glossary");

      expect(model.pages).toEqual([
        {
          kind: "glossary",
          path: "GLOSSARY.md",
          source: "# Shop\n\n**Cart**:\nThe items a shopper intends to buy.\n",
        },
      ]);
    });

    it("lists each markdown ADR in docs/adr/ in name order", async () => {
      const { model } = await readFixture("adrs");

      expect(model.pages).toEqual([
        {
          kind: "adr",
          path: "docs/adr/0001-event-sourced-orders.md",
          source: "# Event-sourced orders\n",
        },
        {
          kind: "adr",
          path: "docs/adr/0002-stripe-for-payments.md",
          source: "# Stripe for payments\n",
        },
      ]);
    });

    it("lists markdown files at the root of the Tracker folder, not Specs or other files", async () => {
      const { model } = await readFixture("tracker-root-markdown");

      expect(model.pages).toEqual([
        {
          kind: "tracker",
          path: ".scratch/README.md",
          source: "# Tracker index\n\nStart with checkout.\n",
        },
      ]);
      expect(model.features.map((feature) => feature.slug)).toEqual(["checkout"]);
    });

    it("lists the markdown files in the Project's .out-of-scope/ folder", async () => {
      const { model } = await readFixture("out-of-scope");

      expect(model.pages).toEqual([
        {
          kind: "out-of-scope",
          path: ".out-of-scope/dark-mode.md",
          source: "# Dark mode\n\nRejected: the shop follows the system theme.\n",
        },
      ]);
    });

    it("lists no pages from docs/adr/ and .out-of-scope/ folders without markdown", async () => {
      const { model } = await readFixture("empty-page-folders");

      expect(model.pages).toEqual([]);
    });

    it("lists each file once when the Tracker folder is the Project root", async () => {
      const { model } = await readFixture("tracker-at-project-root", ".");

      expect(model.pages).toEqual([
        { kind: "glossary", path: "GLOSSARY.md", source: "# Shop\n" },
        { kind: "tracker", path: "README.md", source: "# Shop tickets\n" },
      ]);
      expect(model.features.map((feature) => feature.slug)).toEqual(["checkout"]);
    });

    it("lists each ADR once when the Tracker folder is docs/adr", async () => {
      const { model } = await readFixture("adrs", "docs/adr");

      expect(model.pages.map(({ kind, path }) => ({ kind, path }))).toEqual([
        { kind: "adr", path: "docs/adr/0001-event-sourced-orders.md" },
        { kind: "adr", path: "docs/adr/0002-stripe-for-payments.md" },
      ]);
    });

    it("lists root markdown of a Tracker folder outside the Project by its relative path", async () => {
      const root = path.join(fixtures, "tracker-outside-project");
      const { model } = await readUntouched(path.join(root, "project"), {
        trackerFolder: "../tickets",
        root,
      });

      expect(model.pages).toEqual([
        { kind: "glossary", path: "GLOSSARY.md", source: "# Shop\n" },
        { kind: "tracker", path: "../tickets/README.md", source: "# Shop tickets\n" },
      ]);
    });
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

      const { model } = await readUntouched(projectPath, { root: dir });

      expect(model.features).toEqual([{ slug: "search", spec: { source: "# Search\n" } }]);
      expect(model.skipped).toEqual([]);
    });

    it("ignores a symlink loop", async () => {
      dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-reader-")));
      const trackerPath = path.join(dir, ".scratch");
      await mkdir(path.join(trackerPath, "checkout"), { recursive: true });
      await writeFile(path.join(trackerPath, "checkout", "spec.md"), "# Checkout\n");
      await symlink(path.join(trackerPath, "loop"), path.join(trackerPath, "loop"));

      const { model } = await readUntouched(dir);

      expect(model.features.map((feature) => feature.slug)).toEqual(["checkout"]);
      expect(model.skipped).toEqual([]);
    });
  });
});
