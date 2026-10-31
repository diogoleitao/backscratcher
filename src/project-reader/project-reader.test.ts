import { execFile } from "node:child_process";
import {
  chmod,
  cp,
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
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  type PrLookup,
  type PullRequest,
  type PullRequestRef,
  readProject,
} from "./project-reader.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const execFileAsync = promisify(execFile);

const noPrs: PrLookup = async () => [];

type KnownReference = Pick<PullRequest, "title" | "state"> | "issue";

function fakeLookup(known: Record<string, KnownReference>) {
  const calls: PullRequestRef[][] = [];
  const lookup: PrLookup = async (refs) => {
    calls.push(refs);
    return refs.flatMap((ref) => {
      const found = known[`${ref.repo}#${ref.number}`];
      if (found === undefined || found === "issue") return [];
      return [{ ...ref, ...found, url: `https://github.com/${ref.repo}/pull/${ref.number}` }];
    });
  };
  return { lookup, calls };
}

async function copiedProject(fixture: string): Promise<string> {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-prs-")));
  await cp(path.join(fixtures, fixture), dir, { recursive: true });
  return dir;
}

async function gitProject(fixture: string, remote?: string): Promise<string> {
  const dir = await copiedProject(fixture);
  await execFileAsync("git", ["init", "--quiet", dir]);
  if (remote) await execFileAsync("git", ["-C", dir, "remote", "add", "origin", remote]);
  return dir;
}

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
  {
    trackerFolder,
    root = projectPath,
    prLookup = noPrs,
  }: { trackerFolder?: string; root?: string; prLookup?: PrLookup } = {},
) {
  const before = await snapshot(root);
  const model = await readProject(projectPath, { trackerFolder, prLookup });
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
          spec: {
            source: "# Checkout\n\nLet a shopper pay for the items in their cart.\n",
            referencedPrs: [],
          },
          tickets: [],
          referencedPrs: [],
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

  it("reads the overridden Tracker folder, relative to the Project, in place of .scratch/", async () => {
    const { projectPath, model } = await readFixture("custom-tracker-folder", "docs/tickets");

    expect(model).toEqual({
      trackerFolder: { path: path.join(projectPath, "docs", "tickets"), exists: true },
      features: [
        {
          slug: "billing",
          spec: { source: "# Billing\n", referencedPrs: [] },
          tickets: [],
          referencedPrs: [],
        },
      ],
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

  describe("Tickets", () => {
    it("lists each Ticket with its number, title and Status, from bold and plain headers", async () => {
      const { model } = await readFixture("ticket-headers");

      expect(model.features[0].tickets).toEqual([
        {
          file: "01-cart-total.md",
          number: 1,
          title: "Show the cart total",
          status: "ready-for-agent",
          source:
            "# 01: Show the cart total\n\n**Status:** ready-for-agent\n\n## What to build\n\nShow the sum of the items in the cart.\n",
          warnings: [],
          referencedPrs: [],
        },
        {
          file: "02-card-payment.md",
          number: 2,
          title: "Pay by card",
          status: "needs-triage",
          source:
            "# 02: Pay by card\n\nStatus: needs-triage\n\n## What to build\n\nTake a card payment for the cart total.\n",
          warnings: [],
          referencedPrs: [],
        },
      ]);
    });

    it("reads Status from the header only, in any case and with the colon outside the bold", async () => {
      const { model } = await readFixture("ticket-header-variants");

      expect(
        model.features[0].tickets.map(({ number, status, warnings }) => ({
          number,
          status,
          warnings,
        })),
      ).toEqual([
        { number: 1, status: "wontfix", warnings: [] },
        { number: 2, status: "ready-for-agent", warnings: [] },
        { number: 3, status: undefined, warnings: [] },
      ]);
    });

    it("takes the number from the filename and warns when the heading disagrees", async () => {
      const { model } = await readFixture("ticket-heading-mismatch");

      expect(model.features[0].tickets).toMatchObject([
        {
          number: 3,
          title: "Refund a payment",
          warnings: [{ kind: "heading-number-mismatch", heading: "04", filename: "03" }],
        },
      ]);
    });

    it("orders Tickets by number and ignores files without a number prefix", async () => {
      const { model } = await readFixture("ticket-order");

      expect(model.features[0].tickets.map((ticket) => ticket.file)).toEqual([
        "9-delivery-slot.md",
        "10-gift-wrap.md",
      ]);
    });

    it("still lists a Ticket whose Status line is empty, with a warning", async () => {
      const { model } = await readFixture("ticket-empty-status");

      expect(model.features[0].tickets).toMatchObject([
        {
          number: 7,
          title: "Apply a discount code",
          status: undefined,
          warnings: [{ kind: "status-line-empty" }],
        },
      ]);
    });

    it("warns about a heading without a number and ignores numbered headings below the header", async () => {
      const { model } = await readFixture("ticket-heading-without-number");

      expect(model.features[0].tickets).toMatchObject([
        {
          number: 4,
          title: "refund",
          warnings: [{ kind: "heading-without-number", heading: "Refund a payment" }],
        },
      ]);
    });

    it("reads a numbered heading without a space after the colon, or without a title", async () => {
      const { model } = await readFixture("ticket-heading-spacing");

      expect(
        model.features[0].tickets.map(({ number, title, warnings }) => ({ number, title, warnings })),
      ).toEqual([
        { number: 3, title: "Refund a payment", warnings: [] },
        { number: 4, title: "store-credit", warnings: [] },
        {
          number: 5,
          title: "Pay with a gift card",
          warnings: [{ kind: "heading-number-mismatch", heading: "07", filename: "05" }],
        },
      ]);
    });

    it("falls back to the filename slug when there is no heading", async () => {
      const { model } = await readFixture("ticket-no-heading");

      expect(model.features[0].tickets).toMatchObject([
        { number: 5, title: "guest-checkout", status: "ready-for-human", warnings: [] },
      ]);
    });

    it("tolerates acceptance criteria written twice and keeps the whole file", async () => {
      const { projectPath, model } = await readFixture("ticket-duplicated-criteria");
      const file = path.join(projectPath, ".scratch", "checkout", "issues", "02-receipt.md");

      expect(model.features[0].tickets).toEqual([
        {
          file: "02-receipt.md",
          number: 2,
          title: "Email a receipt",
          status: "ready-for-agent",
          source: await readFile(file, "utf8"),
          warnings: [],
          referencedPrs: [],
        },
      ]);
    });
  });

  describe("with an unreadable Ticket file", () => {
    let dir: string;

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    // chmod 000 does not block reads on Windows, where it only sets the
    // read-only bit, or for root, which ignores file modes.
    const modesBlockReads = process.platform !== "win32" && process.getuid?.() !== 0;

    it.skipIf(!modesBlockReads)("still lists the Ticket, with a warning naming the problem", async () => {
      dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-reader-")));
      const issuesPath = path.join(dir, ".scratch", "checkout", "issues");
      await mkdir(issuesPath, { recursive: true });
      await writeFile(path.join(dir, ".scratch", "checkout", "spec.md"), "# Checkout\n");
      await writeFile(path.join(issuesPath, "06-locked.md"), "# 06: Locked\n");
      await chmod(path.join(issuesPath, "06-locked.md"), 0o000);

      const model = await readProject(dir, { prLookup: noPrs });

      expect(model.features[0].tickets).toMatchObject([
        {
          file: "06-locked.md",
          number: 6,
          title: "locked",
          source: "",
          warnings: [{ kind: "unreadable", message: expect.stringContaining("EACCES") }],
        },
      ]);
    });
  });

  describe("Referenced PRs", () => {
    let dir: string;

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("lists a Ticket's PR #N with the state the lookup reports, resolved against origin", async () => {
      dir = await gitProject("referenced-prs", "git@github.com:acme/shop.git");
      const { lookup } = fakeLookup({ "acme/shop#21": { title: "Cart total", state: "merged" } });

      const { model } = await readUntouched(dir, { prLookup: lookup });

      expect(model.features[0].tickets[0].referencedPrs).toEqual([
        {
          repo: "acme/shop",
          number: 21,
          title: "Cart total",
          state: "merged",
          url: "https://github.com/acme/shop/pull/21",
        },
      ]);
    });

    it("detects every keyword form in any case, once each, and ignores bare #N and PR N", async () => {
      dir = await gitProject("referenced-prs", "https://github.com/acme/shop.git");
      const known = Object.fromEntries(
        [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43].map((n) => [
          `acme/shop#${n}`,
          { title: `PR ${n}`, state: "open" as const },
        ]),
      );
      const { lookup } = fakeLookup(known);

      const { model } = await readUntouched(dir, { prLookup: lookup });

      expect(model.features[0].tickets[1].referencedPrs.map((pr) => pr.number)).toEqual([
        31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43,
      ]);
    });

    it("resolves a github.com pull link in the Spec against the repo it names", async () => {
      dir = await gitProject("referenced-prs", "git@github.com:acme/shop.git");
      const { lookup } = fakeLookup({
        "acme/payments#7": { title: "Payment intents", state: "closed" },
        "acme-labs/sdk.js#12": { title: "Card tokens", state: "draft" },
      });

      const { model } = await readUntouched(dir, { prLookup: lookup });

      expect(model.features[0].spec.referencedPrs).toEqual([
        {
          repo: "acme/payments",
          number: 7,
          title: "Payment intents",
          state: "closed",
          url: "https://github.com/acme/payments/pull/7",
        },
        {
          repo: "acme-labs/sdk.js",
          number: 12,
          title: "Card tokens",
          state: "draft",
          url: "https://github.com/acme-labs/sdk.js/pull/12",
        },
      ]);
    });

    it("lists the Feature's Spec PRs, then each Ticket's PRs tagged with its Ticket", async () => {
      dir = await gitProject("referenced-prs", "git@github.com:acme/shop.git");
      const { lookup } = fakeLookup({
        "acme/payments#7": { title: "Payment intents", state: "open" },
        "acme/shop#21": { title: "Cart total", state: "merged" },
        "acme/shop#31": { title: "Card form", state: "open" },
      });

      const { model } = await readUntouched(dir, { prLookup: lookup });

      expect(model.features[0].referencedPrs).toEqual([
        {
          repo: "acme/payments",
          number: 7,
          title: "Payment intents",
          state: "open",
          url: "https://github.com/acme/payments/pull/7",
        },
        {
          repo: "acme/shop",
          number: 21,
          title: "Cart total",
          state: "merged",
          url: "https://github.com/acme/shop/pull/21",
          ticket: { file: "01-cart-total.md", number: 1, title: "Show the cart total" },
        },
        {
          repo: "acme/shop",
          number: 31,
          title: "Card form",
          state: "open",
          url: "https://github.com/acme/shop/pull/31",
          ticket: { file: "02-card-payment.md", number: 2, title: "Pay by card" },
        },
      ]);
    });

    it("drops a reference the lookup reports as an issue", async () => {
      dir = await gitProject("referenced-prs", "git@github.com:acme/shop.git");
      const { lookup } = fakeLookup({ "acme/shop#21": "issue" });

      const { model } = await readUntouched(dir, { prLookup: lookup });

      expect(model.features[0].tickets[0].referencedPrs).toEqual([]);
    });

    it("asks the lookup once for every distinct reference in the Project", async () => {
      dir = await gitProject("referenced-prs", "git@github.com:acme/shop.git");
      const { lookup, calls } = fakeLookup({});

      await readUntouched(dir, { prLookup: lookup });

      expect(calls).toEqual([
        [
          { repo: "acme/payments", number: 7 },
          { repo: "acme-labs/sdk.js", number: 12 },
          { repo: "acme/shop", number: 21 },
          ...[31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43].map((number) => ({
            repo: "acme/shop",
            number,
          })),
        ],
      ]);
    });

    it("does not call the lookup when no Spec or Ticket references a PR", async () => {
      const { lookup, calls } = fakeLookup({});

      await readUntouched(path.join(fixtures, "ticket-headers"), { prLookup: lookup });

      expect(calls).toEqual([]);
    });

    it.each([
      ["no origin remote", undefined],
      ["an origin remote outside GitHub", "git@gitlab.com:acme/shop.git"],
      ["an origin remote on a host ending in github.com", "https://notgithub.com/acme/shop.git"],
    ])("drops #N references, keeps pull links and reports no error with %s", async (_, remote) => {
      dir = await gitProject("referenced-prs", remote);
      const { lookup, calls } = fakeLookup({
        "acme/payments#7": { title: "Payment intents", state: "open" },
      });

      const { model } = await readUntouched(dir, { prLookup: lookup });

      expect(calls).toEqual([
        [
          { repo: "acme/payments", number: 7 },
          { repo: "acme-labs/sdk.js", number: 12 },
        ],
      ]);
      expect(model.features[0].spec.referencedPrs.map((pr) => pr.number)).toEqual([7]);
      expect(model.features[0].tickets.map((ticket) => ticket.referencedPrs)).toEqual([[], []]);
      expect(model.prLookupError).toBeUndefined();
    });

    it("reads a Project that is not a git repository with no PR state and no error", async () => {
      dir = await copiedProject("referenced-prs");
      const { lookup, calls } = fakeLookup({});

      const { model } = await readUntouched(dir, { prLookup: lookup });

      expect(calls.flat().map((ref) => ref.repo)).toEqual(["acme/payments", "acme-labs/sdk.js"]);
      expect(model.features[0].tickets.map((ticket) => ticket.referencedPrs)).toEqual([[], []]);
      expect(model.prLookupError).toBeUndefined();
    });

    it("still reads the Project when the lookup fails, listing no PRs and naming the failure", async () => {
      dir = await gitProject("referenced-prs", "git@github.com:acme/shop.git");
      const failing: PrLookup = async () => {
        throw new Error("gh: To get started with GitHub CLI, please run: gh auth login");
      };

      const { model } = await readUntouched(dir, { prLookup: failing });

      expect(model.prLookupError).toBe(
        "gh: To get started with GitHub CLI, please run: gh auth login",
      );
      expect(model.features[0].spec.referencedPrs).toEqual([]);
      expect(model.features[0].tickets.map((ticket) => ticket.referencedPrs)).toEqual([[], []]);
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

      expect(model.features).toEqual([
        {
          slug: "search",
          spec: { source: "# Search\n", referencedPrs: [] },
          tickets: [],
          referencedPrs: [],
        },
      ]);
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
