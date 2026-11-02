import {
  chmod,
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
import { type PrLookup, readProject, type Ticket, watchedFolders } from "./project-reader.ts";

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
          tickets: [],
          warnings: [],
        },
      ],
      skipped: [],
      pages: [],
    });
  });

  it("skips a directory without spec.md and without issues/", async () => {
    const { model } = await readFixture("no-spec-no-issues");

    expect(model.features).toEqual([]);
    expect(model.skipped).toEqual([{ slug: "notes", reason: "no-spec" }]);
  });

  it("skips a directory without spec.md that has issues/, and ignores loose files", async () => {
    const { model } = await readFixture("no-spec-with-issues");

    expect(model.features).toEqual([]);
    expect(model.skipped).toEqual([{ slug: "legacy", reason: "no-spec" }]);
  });

  it("lists Features and skipped directories in name order", async () => {
    const { model } = await readFixture("several-directories");

    expect(model.features.map((feature) => feature.slug)).toEqual(["checkout", "search"]);
    expect(model.skipped).toEqual([
      { slug: "archive", reason: "no-spec" },
      { slug: "zeta", reason: "no-spec" },
    ]);
  });

  it("orders names by letter regardless of case", async () => {
    const { model } = await readFixture("mixed-case-names");

    expect(model.features.map((feature) => feature.slug)).toEqual(["alpha", "Zeta"]);
  });

  it("skips a directory whose spec.md is a folder", async () => {
    const { model } = await readFixture("spec-is-directory");

    expect(model.features).toEqual([]);
    expect(model.skipped).toEqual([{ slug: "odd", reason: "no-spec" }]);
  });

  it("reads the overridden Tracker folder, relative to the Project, in place of .scratch/", async () => {
    const { projectPath, model } = await readFixture("custom-tracker-folder", "docs/tickets");

    expect(model).toEqual({
      trackerFolder: { path: path.join(projectPath, "docs", "tickets"), exists: true },
      features: [{ slug: "billing", spec: { source: "# Billing\n" }, tickets: [], warnings: [] }],
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
          normalisedStatus: "ready-for-agent",
          blockers: [],
          brokenBlockers: [],
          source:
            "# 01: Show the cart total\n\n**Status:** ready-for-agent\n\n## What to build\n\nShow the sum of the items in the cart.\n",
          warnings: [],
        },
        {
          file: "02-card-payment.md",
          number: 2,
          title: "Pay by card",
          status: "needs-triage",
          normalisedStatus: "needs-triage",
          blockers: [],
          brokenBlockers: [],
          source:
            "# 02: Pay by card\n\nStatus: needs-triage\n\n## What to build\n\nTake a card payment for the cart total.\n",
          warnings: [],
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

    describe("Status normalisation", () => {
      const statuses = (model: { features: { tickets: Ticket[] }[] }) =>
        model.features[0].tickets.map(({ number, status, normalisedStatus }) => ({
          number,
          status,
          normalisedStatus,
        }));

      it("classifies done and the default triage role strings", async () => {
        const { model } = await readFixture("ticket-status-known");

        expect(statuses(model)).toEqual([
          { number: 1, status: "done", normalisedStatus: "done" },
          { number: 2, status: "ready-for-agent", normalisedStatus: "ready-for-agent" },
        ]);
      });

      it("strips backticks from the Status", async () => {
        const { model } = await readFixture("ticket-status-backticked");

        expect(statuses(model)).toEqual([
          { number: 3, status: "`needs-info`", normalisedStatus: "needs-info" },
        ]);
      });

      it("classifies a prose Status line from its first word before a . or ,", async () => {
        const { model } = await readFixture("ticket-status-prose");

        expect(statuses(model)).toEqual([
          {
            number: 4,
            status: "done. Prevents a bug where the total went negative, see PR #12.",
            normalisedStatus: "done",
          },
          {
            number: 5,
            status: "`wontfix`, the provider shut down",
            normalisedStatus: "wontfix",
          },
        ]);
      });

      it("classifies a Status in any case", async () => {
        const { model } = await readFixture("ticket-status-case");

        expect(statuses(model)).toEqual([
          { number: 1, status: "Done.", normalisedStatus: "done" },
          { number: 2, status: "Ready-For-Agent", normalisedStatus: "ready-for-agent" },
        ]);
      });

      it("classifies an unknown value as other, keeping the raw text", async () => {
        const { model } = await readFixture("ticket-status-unknown");

        expect(statuses(model)).toEqual([
          { number: 6, status: "resolved", normalisedStatus: "other" },
        ]);
      });

      it("classifies a Ticket without a Status line as none", async () => {
        const { model } = await readFixture("ticket-status-missing");

        expect(statuses(model)).toEqual([
          { number: 7, status: undefined, normalisedStatus: "none" },
        ]);
      });

      it("maps the Project's triage-labels.md labels back to their roles, in place of the defaults", async () => {
        const { model } = await readFixture("custom-triage-labels");

        expect(statuses(model)).toEqual([
          { number: 1, status: "afk", normalisedStatus: "ready-for-agent" },
          {
            number: 2,
            status: "`waiting-on-reporter`. Which card networks?",
            normalisedStatus: "needs-info",
          },
          { number: 3, status: "ready-for-agent", normalisedStatus: "other" },
          { number: 4, status: "done", normalisedStatus: "done" },
        ]);
      });

      it("finds the triage-labels.md columns by their headers, in any order", async () => {
        const { model } = await readFixture("triage-labels-reordered");

        expect(statuses(model)).toEqual([
          { number: 1, status: "afk", normalisedStatus: "ready-for-agent" },
          { number: 2, status: "triage", normalisedStatus: "needs-triage" },
        ]);
      });

      it("keeps the default string for a role triage-labels.md does not list", async () => {
        const { model } = await readFixture("triage-labels-partial");

        expect(statuses(model)).toEqual([
          { number: 1, status: "afk", normalisedStatus: "ready-for-agent" },
          { number: 2, status: "ready-for-agent", normalisedStatus: "other" },
          { number: 3, status: "needs-info", normalisedStatus: "needs-info" },
        ]);
      });
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
          normalisedStatus: "ready-for-agent",
          blockers: [],
          brokenBlockers: [],
          source: await readFile(file, "utf8"),
          warnings: [],
        },
      ]);
    });
  });

  describe("Blockers", () => {
    const blockersOf = (tickets: { number: number; blockers: string[]; brokenBlockers: string[] }[]) =>
      tickets.map(({ number, blockers, brokenBlockers }) => ({ number, blockers, brokenBlockers }));

    it("resolves Blockers written by number or file name, from bold and plain header lines only", async () => {
      const { model } = await readFixture("ticket-blockers-by-number");

      expect(blockersOf(model.features[0].tickets)).toEqual([
        { number: 1, blockers: [], brokenBlockers: [] },
        { number: 2, blockers: ["01-cart-total.md"], brokenBlockers: [] },
        { number: 3, blockers: ["01-cart-total.md", "02-card-payment.md"], brokenBlockers: [] },
        {
          number: 4,
          blockers: ["01-cart-total.md", "02-card-payment.md", "03-receipt.md"],
          brokenBlockers: [],
        },
      ]);
      expect(model.features[0].tickets.flatMap((ticket) => ticket.warnings)).toEqual([]);
    });

    it("links a number shared by two Tickets to both of them", async () => {
      const { model } = await readFixture("ticket-blockers-shared-number");

      expect(blockersOf(model.features[0].tickets)).toEqual([
        { number: 3, blockers: [], brokenBlockers: [] },
        { number: 3, blockers: [], brokenBlockers: [] },
        { number: 4, blockers: ["03-invoice.md", "03-receipt.md"], brokenBlockers: [] },
      ]);
      expect(model.features[0].tickets.flatMap((ticket) => ticket.warnings)).toEqual([]);
    });

    it("resolves Blockers written by title in any case, including titles that start with a number or end in ?", async () => {
      const { model } = await readFixture("ticket-blockers-by-title");

      expect(blockersOf(model.features[0].tickets)).toEqual([
        { number: 1, blockers: [], brokenBlockers: [] },
        { number: 2, blockers: ["01-cart-total.md"], brokenBlockers: [] },
        { number: 3, blockers: ["01-cart-total.md", "02-card-payment.md"], brokenBlockers: [] },
        { number: 4, blockers: [], brokenBlockers: [] },
        { number: 5, blockers: [], brokenBlockers: [] },
        { number: 6, blockers: ["04-3d-secure.md", "05-slow-checkout.md"], brokenBlockers: [] },
      ]);
      expect(model.features[0].tickets.flatMap((ticket) => ticket.warnings)).toEqual([]);
    });

    it("reads None, nothing, N/A, - or (none) as no Blockers, ignoring links later in the line", async () => {
      const { model } = await readFixture("ticket-blockers-none");

      expect(blockersOf(model.features[0].tickets)).toEqual([
        { number: 1, blockers: [], brokenBlockers: [] },
        { number: 2, blockers: [], brokenBlockers: [] },
        { number: 3, blockers: [], brokenBlockers: [] },
        { number: 4, blockers: [], brokenBlockers: [] },
        { number: 5, blockers: [], brokenBlockers: [] },
      ]);
      expect(model.features[0].tickets.flatMap((ticket) => ticket.warnings)).toEqual([]);
    });

    it("keeps an entry that matches no other Ticket in the Feature, or names a missing number, as a broken Blocker reference", async () => {
      const { model } = await readFixture("ticket-blockers-broken");

      expect(blockersOf(model.features[0].tickets)).toEqual([
        { number: 1, blockers: [], brokenBlockers: [] },
        {
          number: 2,
          blockers: ["01-cart-total.md"],
          brokenBlockers: ["07", "#08 (Store credit)", "Pay by card", "09: Show the cart total", "02"],
        },
      ]);
      expect(model.features[0].tickets.flatMap((ticket) => ticket.warnings)).toEqual([]);
    });

    it("warns about an empty line, prose, links or numbers it cannot reduce, still resolving the other entries", async () => {
      const { model } = await readFixture("ticket-blockers-unparseable");

      expect(
        model.features[0].tickets.map(({ number, blockers, brokenBlockers, warnings }) => ({
          number,
          blockers,
          brokenBlockers,
          warnings,
        })),
      ).toEqual([
        {
          number: 1,
          blockers: [],
          brokenBlockers: [],
          warnings: [{ kind: "blocked-by-unparseable", line: "" }],
        },
        {
          number: 2,
          blockers: ["01-cart-total.md"],
          brokenBlockers: [],
          warnings: [
            {
              kind: "blocked-by-unparseable",
              line: "01, waiting on ops. See https://example.com/ops",
            },
          ],
        },
        {
          number: 3,
          blockers: ["02-card-payment.md"],
          brokenBlockers: [],
          warnings: [
            {
              kind: "blocked-by-unparseable",
              line: "Pay by card, see [the design](https://example.com/design)",
            },
          ],
        },
        {
          number: 4,
          blockers: [],
          brokenBlockers: [],
          warnings: [{ kind: "blocked-by-unparseable", line: "01 and 02" }],
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

  describe("with an unreadable folder or Spec", () => {
    let dir: string;
    let locked: string[] = [];

    // rm cannot descend into a folder with mode 000, so modes are restored first.
    afterEach(async () => {
      for (const lockedPath of locked) await chmod(lockedPath, 0o755);
      locked = [];
      await rm(dir, { recursive: true, force: true });
    });

    async function lock(lockedPath: string) {
      await chmod(lockedPath, 0o000);
      locked.push(lockedPath);
    }

    // chmod 000 does not block reads on Windows, where it only sets the
    // read-only bit, or for root, which ignores file modes.
    const modesBlockReads = process.platform !== "win32" && process.getuid?.() !== 0;

    // A Project with a readable Feature, `search`, beside `checkout`.
    async function projectWithCheckout(): Promise<string> {
      dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-reader-")));
      const checkoutPath = path.join(dir, ".scratch", "checkout");
      await mkdir(path.join(checkoutPath, "issues"), { recursive: true });
      await writeFile(path.join(checkoutPath, "spec.md"), "# Checkout\n");
      await writeFile(path.join(checkoutPath, "issues", "01-cart-total.md"), "# 01: Cart total\n");
      await mkdir(path.join(dir, ".scratch", "search"));
      await writeFile(path.join(dir, ".scratch", "search", "spec.md"), "# Search\n");
      return checkoutPath;
    }

    it.skipIf(!modesBlockReads)(
      "lists a Feature whose issues/ folder cannot be read, with a warning naming the problem",
      async () => {
        const checkoutPath = await projectWithCheckout();
        await lock(path.join(checkoutPath, "issues"));

        const model = await readProject(dir, { prLookup: noPrs });

        expect(model.features).toEqual([
          {
            slug: "checkout",
            spec: { source: "# Checkout\n" },
            tickets: [],
            warnings: [{ kind: "issues-unreadable", message: expect.stringContaining("EACCES") }],
          },
          { slug: "search", spec: { source: "# Search\n" }, tickets: [], warnings: [] },
        ]);
      },
    );

    it.skipIf(!modesBlockReads)(
      "lists a Feature whose spec.md cannot be read, with a warning naming the problem",
      async () => {
        const checkoutPath = await projectWithCheckout();
        await lock(path.join(checkoutPath, "spec.md"));

        const model = await readProject(dir, { prLookup: noPrs });

        expect(model.features[0].spec).toEqual({ source: undefined });
        expect(model.features).toMatchObject([
          {
            slug: "checkout",
            tickets: [{ file: "01-cart-total.md", title: "Cart total" }],
            warnings: [{ kind: "spec-unreadable", message: expect.stringContaining("EACCES") }],
          },
          { slug: "search", spec: { source: "# Search\n" }, tickets: [], warnings: [] },
        ]);
        expect(model.skipped).toEqual([]);
      },
    );

    it.skipIf(!modesBlockReads)(
      "skips a Feature directory that cannot be read, with a reason naming the problem",
      async () => {
        const checkoutPath = await projectWithCheckout();
        await lock(checkoutPath);

        const model = await readProject(dir, { prLookup: noPrs });

        expect(model.features.map((feature) => feature.slug)).toEqual(["search"]);
        expect(model.skipped).toEqual([
          { slug: "checkout", reason: "unreadable", message: expect.stringContaining("EACCES") },
        ]);
      },
    );

    it.skipIf(!modesBlockReads)(
      "reports a Tracker folder that cannot be read, and still reads the Project-level pages",
      async () => {
        await projectWithCheckout();
        await writeFile(path.join(dir, "GLOSSARY.md"), "# Glossary\n");
        await lock(path.join(dir, ".scratch"));

        const model = await readProject(dir, { prLookup: noPrs });

        expect(model).toEqual({
          trackerFolder: {
            path: path.join(dir, ".scratch"),
            exists: true,
            unreadable: expect.stringContaining("EACCES"),
          },
          features: [],
          skipped: [],
          pages: [{ kind: "glossary", path: "GLOSSARY.md", source: "# Glossary\n" }],
        });
      },
    );
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
        { slug: "search", spec: { source: "# Search\n" }, tickets: [], warnings: [] },
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

describe("watchedFolders", () => {
  const projectPath = path.join(path.sep, "work", "shop");

  it("watches the Tracker folder recursively, and each Project-level page folder and the triage-labels.md folder on its own", () => {
    expect(watchedFolders(projectPath, {})).toEqual([
      { path: path.join(projectPath, ".scratch"), recursive: true },
      { path: projectPath, recursive: false },
      { path: path.join(projectPath, "docs", "adr"), recursive: false },
      { path: path.join(projectPath, ".out-of-scope"), recursive: false },
      { path: path.join(projectPath, "docs", "agents"), recursive: false },
    ]);
  });

  it("watches the Project root once, recursively, when it is the Tracker folder", () => {
    expect(watchedFolders(projectPath, { trackerFolder: "." })).toEqual([
      { path: projectPath, recursive: true },
      { path: path.join(projectPath, "docs", "adr"), recursive: false },
      { path: path.join(projectPath, ".out-of-scope"), recursive: false },
      { path: path.join(projectPath, "docs", "agents"), recursive: false },
    ]);
  });

  it("watches a Tracker folder outside the Project", () => {
    expect(watchedFolders(projectPath, { trackerFolder: "../tickets" })[0]).toEqual({
      path: path.join(path.sep, "work", "tickets"),
      recursive: true,
    });
  });
});
