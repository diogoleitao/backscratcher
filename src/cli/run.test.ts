import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerRecord } from "../data/server-record.ts";
import { openRegistry } from "../registry/registry.ts";
import { runCli } from "./run.ts";

// Stands in for the Next.js server: answers every request on the port it is
// given, on 127.0.0.1.
const TINY_SERVER = `
require("node:http")
  .createServer((req, res) => res.end("ok"))
  .listen(Number(process.argv[1]), "127.0.0.1");
`;

let dir: string;
let configPath: string;
let projectDir: string;
let cwd: () => string;
let port: number;
let url: string;

beforeEach(async () => {
  // Real path, so expected paths match the registry's canonical ones.
  dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-cli-")));
  configPath = path.join(dir, "config.json");
  projectDir = path.join(dir, "project");
  await mkdir(projectDir);
  cwd = () => projectDir;
  port = await freePort();
  url = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  const record = await serverRecord();
  if (record !== undefined && isAlive(record.pid)) process.kill(record.pid, "SIGKILL");
  await rm(dir, { recursive: true, force: true });
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function dataDir() {
  return path.join(dir, "data");
}

async function cli(
  argv: string[],
  options: {
    serverArgs?: string[];
    startTimeoutMs?: number;
    platform?: NodeJS.Platform;
    configPath?: string;
  } = {},
) {
  let stdout = "";
  let stderr = "";
  const opened: string[] = [];
  const code = await runCli(argv, {
    configPath: options.configPath ?? configPath,
    dataDir: dataDir(),
    url,
    server: {
      command: process.execPath,
      args: options.serverArgs ?? ["-e", TINY_SERVER, String(port)],
      cwd: dir,
    },
    startTimeoutMs: options.startTimeoutMs ?? 10_000,
    platform: options.platform ?? process.platform,
    cwd,
    openBrowser: (target) => void opened.push(target),
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr, opened };
}

async function serverRecord(): Promise<ServerRecord | undefined> {
  try {
    return JSON.parse(await readFile(path.join(dataDir(), "server.json"), "utf8"));
  } catch {
    return undefined;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A stopped process can linger briefly until the system reaps it.
async function isGone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  while (isAlive(pid)) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

async function isAnswering(target: string): Promise<boolean> {
  try {
    await fetch(target);
    return true;
  } catch {
    return false;
  }
}

async function writeServerRecord(record: ServerRecord) {
  await mkdir(dataDir(), { recursive: true });
  await writeFile(path.join(dataDir(), "server.json"), JSON.stringify(record));
}

// A live process that is not a backscratcher server, standing in for one that
// was given the recorded server's pid after it exited.
async function withUnrelatedProcess(test: (pid: number) => Promise<void>) {
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  try {
    await test(unrelated.pid!);
  } finally {
    unrelated.kill("SIGKILL");
  }
}

function systemError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("errors", () => {
  it("reports a config path that is a directory as one line, exiting 1", async () => {
    const result = await cli(["config"], { configPath: dir });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^backscratcher: EISDIR[^\n]*\n$/);
  });

  it("prints usage without a command, exiting 2 and starting nothing", async () => {
    const result = await cli([]);
    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr:
        "usage: backscratcher start | stop | add [path] | remove [path] | config [tracker ...]\n",
      opened: [],
    });
    expect(await serverRecord()).toBeUndefined();
  });

  it.each([
    [["start", "--port", "5000"]],
    [["start", "--no-open"]],
    [["start", "--config", "cfg.json"]],
    [["config", "--config", "cfg.json"]],
    [["start", "extra"]],
    [["stop", "extra"]],
  ])("rejects %j, exiting 2 and starting nothing", async (argv) => {
    const result = await cli(argv);
    expect(result.code).toBe(2);
    expect(result.stderr).not.toBe("");
    expect(await serverRecord()).toBeUndefined();
  });

  it("rejects an unknown command", async () => {
    const result = await cli(["frobnicate"]);
    expect(result).toMatchObject({
      code: 2,
      stderr: 'backscratcher: unknown command "frobnicate"\n',
    });
  });
});

describe("backscratcher start", () => {
  it("starts the server in the background, records it, prints the URL, and opens the browser", async () => {
    const result = await cli(["start"]);

    expect(result).toEqual({
      code: 0,
      stdout: `backscratcher running at ${url}\n`,
      stderr: "",
      opened: [url],
    });
    const record = await serverRecord();
    expect(record).toEqual({ pid: expect.any(Number), url });
    expect(isAlive(record!.pid)).toBe(true);
    expect(await isAnswering(url)).toBe(true);
  });

  it("only opens the browser when the recorded server is running", async () => {
    await cli(["start"]);
    const first = await serverRecord();

    const result = await cli(["start"]);

    expect(result).toEqual({
      code: 0,
      stdout: `backscratcher running at ${url}\n`,
      stderr: "",
      opened: [url],
    });
    expect(await serverRecord()).toEqual(first);
    expect(isAlive(first!.pid)).toBe(true);
  });

  it("starts a new server when the recorded one is gone", async () => {
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    await writeServerRecord({ pid: gone, url });

    const result = await cli(["start"]);

    expect(result).toEqual({
      code: 0,
      stdout: `backscratcher running at ${url}\n`,
      stderr: "",
      opened: [url],
    });
    const record = await serverRecord();
    expect(record!.pid).not.toBe(gone);
    expect(isAlive(record!.pid)).toBe(true);
    expect(await isAnswering(url)).toBe(true);
  });

  it("starts a new server when the record is not valid JSON", async () => {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(path.join(dataDir(), "server.json"), "{ not json");

    const result = await cli(["start"]);

    expect(result).toMatchObject({ code: 0, stderr: "", opened: [url] });
    expect(await serverRecord()).toEqual({ pid: expect.any(Number), url });
  });

  it("starts a new server when the recorded pid now belongs to another process", async () => {
    await withUnrelatedProcess(async (unrelated) => {
      await writeServerRecord({ pid: unrelated, url });

      const result = await cli(["start"]);

      expect(result.code).toBe(0);
      const record = await serverRecord();
      expect(record!.pid).not.toBe(unrelated);
      expect(await isAnswering(url)).toBe(true);
      expect(isAlive(unrelated)).toBe(true);
    });
  });

  it("fails, recording nothing and stopping the server, when it does not answer in time", async () => {
    const pidFile = path.join(dir, "silent.pid");
    const silent = `
      require("node:fs").writeFileSync(process.argv[1], String(process.pid));
      setInterval(() => {}, 1000);
    `;

    const result = await cli(["start"], {
      serverArgs: ["-e", silent, pidFile],
      startTimeoutMs: 500,
    });

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: `backscratcher: the server did not answer on ${url} within 0.5 seconds; see ${path.join(dataDir(), "server.log")}\n`,
      opened: [],
    });
    expect(await serverRecord()).toBeUndefined();
    expect(isAlive(Number(await readFile(pidFile, "utf8")))).toBe(false);
  });

  it("fails, recording nothing, when the server exits before it answers", async () => {
    const result = await cli(["start"], { serverArgs: ["-e", "process.exit(1)"] });

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: `backscratcher: the server exited before it answered; see ${path.join(dataDir(), "server.log")}\n`,
      opened: [],
    });
    expect(await serverRecord()).toBeUndefined();
  });

  it("fails, recording nothing, when something else already answers on the URL", async () => {
    const other = createHttpServer((req, res) => res.end("other"));
    await new Promise<void>((resolve) => other.listen(port, "127.0.0.1", resolve));
    try {
      const result = await cli(["start"]);

      expect(result).toEqual({
        code: 1,
        stdout: "",
        stderr: `backscratcher: ${url} is already in use\n`,
        opened: [],
      });
      expect(await serverRecord()).toBeUndefined();
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });
});

describe("backscratcher stop", () => {
  it("stops the recorded server and clears the record", async () => {
    await cli(["start"]);
    const { pid } = (await serverRecord())!;

    const result = await cli(["stop"]);

    expect(result).toEqual({
      code: 0,
      stdout: "backscratcher stopped\n",
      stderr: "",
      opened: [],
    });
    expect(isAlive(pid)).toBe(false);
    expect(await isAnswering(url)).toBe(false);
    expect(await serverRecord()).toBeUndefined();
  });

  it("stops the processes the server started too", async () => {
    const childPidFile = path.join(dir, "child.pid");
    const parent = `
      const child = require("node:child_process").spawn(
        process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      require("node:fs").writeFileSync(process.argv[2], String(child.pid));
      ${TINY_SERVER}
    `;
    await cli(["start"], { serverArgs: ["-e", parent, String(port), childPidFile] });
    const childPid = Number(await readFile(childPidFile, "utf8"));
    try {
      expect((await cli(["stop"])).stdout).toBe("backscratcher stopped\n");
      expect(await isGone(childPid)).toBe(true);
    } finally {
      if (isAlive(childPid)) process.kill(childPid, "SIGKILL");
    }
  });

  it("says so and clears the record when the record is not valid JSON", async () => {
    await mkdir(dataDir(), { recursive: true });
    await writeFile(path.join(dataDir(), "server.json"), "{ not json");

    const result = await cli(["stop"]);

    expect(result).toEqual({
      code: 0,
      stdout: "backscratcher is not running\n",
      stderr: "",
      opened: [],
    });
    await expect(readFile(path.join(dataDir(), "server.json"))).rejects.toThrow();
  });

  it("says so when no server was started", async () => {
    const result = await cli(["stop"]);

    expect(result).toEqual({
      code: 0,
      stdout: "backscratcher is not running\n",
      stderr: "",
      opened: [],
    });
  });

  it("says so and clears the record when the recorded server is gone", async () => {
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    await writeServerRecord({ pid: gone, url });

    const result = await cli(["stop"]);

    expect(result.stdout).toBe("backscratcher is not running\n");
    expect(await serverRecord()).toBeUndefined();
  });

  it("says so, leaving it running, when the recorded pid now belongs to another process", async () => {
    await withUnrelatedProcess(async (unrelated) => {
      await writeServerRecord({ pid: unrelated, url });

      const result = await cli(["stop"]);

      expect(result.stdout).toBe("backscratcher is not running\n");
      expect(await serverRecord()).toBeUndefined();
      expect(isAlive(unrelated)).toBe(true);
    });
  });
});

describe("on Windows", () => {
  it.each([["start"], ["stop"]])("refuses %s, exiting 1", async (command) => {
    const result = await cli([command], { platform: "win32" });

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: `backscratcher: ${command} is not supported on Windows\n`,
      opened: [],
    });
    expect(await serverRecord()).toBeUndefined();
  });

  it("still adds, removes, and prints the config", async () => {
    const platform = "win32";
    expect((await cli(["add"], { platform })).code).toBe(0);
    expect((await cli(["config"], { platform })).code).toBe(0);
    expect((await cli(["remove"], { platform })).code).toBe(0);
  });
});

describe("backscratcher config", () => {
  it("prints the config file path", async () => {
    expect(await cli(["config"])).toMatchObject({
      code: 0,
      stdout: `config file: ${configPath}\n`,
    });
  });

  it.each([
    [["config", "port", "5050"]],
    [["config", "open", "false"]],
    [["config", "port", "--unset"]],
  ])("rejects %j as an unknown setting, without writing", async (argv) => {
    const result = await cli(argv);
    expect(result).toMatchObject({
      code: 2,
      stderr: `backscratcher: unknown setting "${argv[1]}" (expected tracker)\n`,
    });
    await expect(readFile(configPath, "utf8")).rejects.toThrow();
  });

  it("ignores settings left in the config file by an earlier version", async () => {
    await writeFile(configPath, JSON.stringify({ settings: { port: 5050, open: false } }));
    expect(await cli(["config"])).toMatchObject({
      code: 0,
      stdout: `config file: ${configPath}\n`,
    });
  });

  it("reports an invalid config file and exits 1", async () => {
    await writeFile(configPath, "{ not json");

    const result = await cli(["config"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${configPath} is not valid JSON`);
  });

  it("prints the config file and reports invalid Projects, exiting 1", async () => {
    const projects = [{ path: projectDir, trackerFolder: "../elsewhere" }];
    await writeFile(configPath, JSON.stringify({ projects }));

    const result = await cli(["config"]);
    expect(result).toEqual({
      code: 1,
      stdout: `config file: ${configPath}\n`,
      stderr: `backscratcher: config file ${configPath}: the trackerFolder of ${projectDir} must be a relative path to a folder inside the Project\n`,
      opened: [],
    });
  });
});

describe("backscratcher config tracker", () => {
  const projects = () => openRegistry(configPath).list();

  it("sets the current directory's override, and config prints each Project's", async () => {
    const other = path.join(dir, "other");
    await mkdir(other);
    await cli(["add"]);
    await cli(["add", other]);

    const result = await cli(["config", "tracker", "docs/tickets"]);
    expect(result).toMatchObject({ code: 0, stderr: "" });

    expect((await cli(["config"])).stdout).toBe(
      `config file: ${configPath}\n` +
        `tracker ${projectDir}: docs/tickets\n` +
        `tracker ${other}: .scratch (default)\n`,
    );
  });

  it("sets and unsets the override of a Project named by path", async () => {
    const other = path.join(dir, "other");
    await mkdir(other);
    await cli(["add", other]);

    await cli(["config", "tracker", "tickets", "../other"]);
    expect(await projects()).toEqual([{ path: other, trackerFolder: "tickets" }]);

    const result = await cli(["config", "tracker", "--unset", "../other"]);
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(await projects()).toEqual([{ path: other }]);
  });

  it("reports a path that is not a registered Project as one line, exiting 1", async () => {
    const result = await cli(["config", "tracker", "docs"]);
    expect(result).toMatchObject({
      code: 1,
      stderr: `backscratcher: ${projectDir} is not a registered Project\n`,
    });
  });

  it("reports an override outside the Project as one line, exiting 1", async () => {
    await cli(["add"]);

    const result = await cli(["config", "tracker", "../elsewhere"]);
    expect(result).toMatchObject({
      code: 1,
      stderr:
        'backscratcher: invalid Tracker folder "../elsewhere" (expected a relative path to a folder inside the Project)\n',
    });
    expect(await projects()).toEqual([{ path: projectDir }]);
  });

  it("rejects add --tracker on a registered Project, pointing to config tracker", async () => {
    await cli(["add", "--tracker", "kept"]);

    const result = await cli(["add", "--tracker", "docs"]);
    expect(result).toMatchObject({
      code: 1,
      stderr: `backscratcher: ${projectDir} is already a registered Project; set its Tracker folder with: backscratcher config tracker <dir> [path]\n`,
    });
    expect(await projects()).toEqual([{ path: projectDir, trackerFolder: "kept" }]);
  });

  it.each([
    [["config", "tracker"]],
    [["config", "tracker", "docs", ".", "extra"]],
    [["config", "tracker", "--unset", ".", "extra"]],
    [["config", "tracker", "docs", "--tracker", "docs"]],
    [["config", "--unset"]],
    [["config", "--tracker", "docs"]],
    [["remove", "--tracker", "docs"]],
    [["start", "--tracker", "docs"]],
    [["--tracker", "docs"]],
  ])("rejects %j without changing the override", async (argv) => {
    await cli(["add", "--tracker", "kept"]);

    const result = await cli(argv);
    expect(result.code).toBe(2);
    expect(result.stderr).not.toBe("");
    expect(await projects()).toEqual([{ path: projectDir, trackerFolder: "kept" }]);
    expect(await serverRecord()).toBeUndefined();
  });
});

describe("backscratcher add and remove", () => {
  const projects = () => openRegistry(configPath).list();

  it("adds the current directory, then reports it as already registered", async () => {
    const first = await cli(["add"]);
    expect(first).toMatchObject({ code: 0, stdout: `added: ${projectDir}\n` });

    const again = await cli(["add"]);
    expect(again).toMatchObject({ code: 0, stdout: `already registered: ${projectDir}\n` });
    expect(await projects()).toEqual([{ path: projectDir }]);
  });

  it("adds a relative path as an absolute path", async () => {
    await mkdir(path.join(projectDir, "nested"));

    const result = await cli(["add", "nested"]);
    expect(result.stdout).toBe(`added: ${path.join(projectDir, "nested")}\n`);
    expect(await projects()).toEqual([{ path: path.join(projectDir, "nested") }]);
  });

  it("adds a Project with a Tracker folder override", async () => {
    const result = await cli(["add", "--tracker", "docs/tickets"]);
    expect(result).toMatchObject({ code: 0, stdout: `added: ${projectDir}\n` });
    expect(await projects()).toEqual([{ path: projectDir, trackerFolder: "docs/tickets" }]);
  });

  it("removes the current directory", async () => {
    await cli(["add"]);

    const result = await cli(["remove"]);
    expect(result).toMatchObject({ code: 0, stdout: `removed: ${projectDir}\n` });
    expect(await projects()).toEqual([]);
  });

  it.each([
    [["add", "missing"], `${path.join("<projectDir>", "missing")} is not a directory`],
    [["remove", "missing"], `${path.join("<projectDir>", "missing")} is not a registered Project`],
  ])("reports %j as one line, exiting 1", async (argv, message) => {
    const result = await cli(argv);
    expect(result).toMatchObject({
      code: 1,
      stderr: `backscratcher: ${message.replace("<projectDir>", projectDir)}\n`,
    });
  });

  it.each([
    [["add", "a", "b"]],
    [["remove", "a", "b"]],
    [["add", "--unset"]],
  ])("rejects %j without changing the Projects", async (argv) => {
    const result = await cli(argv);
    expect(result.code).toBe(2);
    expect(result.stderr).not.toBe("");
    expect(await projects()).toEqual([]);
  });
});

describe("with the working directory deleted", () => {
  beforeEach(() => {
    cwd = () => {
      throw systemError("ENOENT", "ENOENT: no such file or directory, uv_cwd");
    };
  });

  it("prints the config and starts the server", async () => {
    expect((await cli(["config"])).code).toBe(0);
    expect((await cli(["start"])).code).toBe(0);
  });

  it("adds and removes a Project named by absolute path", async () => {
    expect((await cli(["add", projectDir])).code).toBe(0);
    expect((await cli(["remove", projectDir])).code).toBe(0);
  });

  it.each([[["add"]], [["remove"]], [["add", "nested"]], [["config", "tracker", "docs"]]])(
    "reports %j as one line, exiting 1",
    async (argv) => {
      const result = await cli(argv);
      expect(result).toMatchObject({
        code: 1,
        stderr:
          "backscratcher: the working directory no longer exists; cd into a folder, or pass the Project's absolute path\n",
      });
    },
  );
});
