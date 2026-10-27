import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRegistry } from "../registry/registry.ts";
import { PortInUseError } from "../server/errors.ts";
import type { ServerOptions } from "../server/options.ts";
import { runCli } from "./run.ts";

let dir: string;
let configPath: string;
let projectDir: string;

beforeEach(async () => {
  // Real path, so expected paths match the registry's canonical ones.
  dir = await realpath(await mkdtemp(path.join(tmpdir(), "backscratcher-cli-")));
  configPath = path.join(dir, "config.json");
  projectDir = path.join(dir, "project");
  await mkdir(projectDir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function cli(
  argv: string[],
  env: Record<string, string> = {},
  startError?: Error,
) {
  let stdout = "";
  let stderr = "";
  const started: ServerOptions[] = [];
  const configPaths: string[] = [];
  const code = await runCli(argv, {
    env,
    home: path.join(dir, "home"),
    cwd: projectDir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    startServer: async ({ configPath, ...options }) => {
      if (startError) throw startError;
      started.push(options);
      configPaths.push(configPath);
    },
  });
  return { code, stdout, stderr, started, configPaths };
}

function systemError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("errors", () => {
  it("reports a taken port with how to pick another, exiting 1", async () => {
    const result = await cli([], {}, new PortInUseError(4747));
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "backscratcher: port 4747 is already in use. Stop whatever is using it, or start with --port <n> or set one with: backscratcher config port <n>\n",
    );
  });

  it("reports a system error from the server as one line, exiting 1", async () => {
    const result = await cli(
      ["--port", "80"],
      {},
      systemError("EACCES", "listen EACCES: permission denied 127.0.0.1:80"),
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "backscratcher: listen EACCES: permission denied 127.0.0.1:80\n",
    );
  });

  it("reports a config path that is a directory as one line, exiting 1", async () => {
    const result = await cli(["config", "--config", dir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^backscratcher: EISDIR[^\n]*\n$/);
  });
});

describe("backscratcher (start)", () => {
  it("starts with the defaults when nothing is configured", async () => {
    expect((await cli([])).started).toEqual([{ port: 4747, open: true }]);
  });

  it("reads settings from the BACKSCRATCHER_CONFIG file, with flags winning", async () => {
    const env = { BACKSCRATCHER_CONFIG: configPath };
    await cli(["config", "port", "5050"], env);
    await cli(["config", "open", "false"], env);

    expect((await cli([], env)).started).toEqual([{ port: 5050, open: false }]);
    expect((await cli(["--port", "6060"], env)).started).toEqual([
      { port: 6060, open: false },
    ]);
  });

  it("gives the server the config file in use", async () => {
    expect((await cli([])).configPaths).toEqual([
      path.join(dir, "home", ".config", "backscratcher", "config.json"),
    ]);
    expect((await cli(["--config", configPath])).configPaths).toEqual([configPath]);
  });

  it("--no-open overrides a configured open", async () => {
    await cli(["config", "open", "true", "--config", configPath]);
    expect((await cli(["--no-open", "--config", configPath])).started).toEqual([
      { port: 4747, open: false },
    ]);
  });

  it("rejects an invalid --port without starting", async () => {
    const result = await cli(["--port", "nope"]);
    expect(result.code).not.toBe(0);
    expect(result.started).toEqual([]);
  });

  it("rejects an unknown command without starting", async () => {
    const result = await cli(["frobnicate"]);
    expect(result.code).not.toBe(0);
    expect(result.started).toEqual([]);
  });
});

describe("backscratcher config", () => {
  it("sets the port and prints it", async () => {
    expect((await cli(["config", "port", "5050", "--config", configPath])).code).toBe(0);

    const printed = await cli(["config", "--config", configPath]);
    expect(printed.code).toBe(0);
    expect(printed.stdout).toContain("port: 5050");
  });

  it("sets open and prints it", async () => {
    expect((await cli(["config", "open", "false", "--config", configPath])).code).toBe(0);

    expect((await cli(["config", "--config", configPath])).stdout).toContain(
      "open: false",
    );
  });

  it("unsets a value and prints the default with the config file path", async () => {
    await cli(["config", "port", "5050", "--config", configPath]);
    expect((await cli(["config", "port", "--unset", "--config", configPath])).code).toBe(0);

    expect((await cli(["config", "--config", configPath])).stdout).toBe(
      `config file: ${configPath}\nport: 4747 (default)\nopen: true (default)\n`,
    );
  });

  it.each([
    [["config", "port", "5000", "--unset"]],
    [["config", "port", "5000", "6000"]],
    [["config", "port", "5000", "--port", "6000"]],
    [["config", "--no-open"]],
    [["config", "--unset"]],
  ])("rejects %j without changing the config", async (argv) => {
    await cli(["config", "port", "5050", "--config", configPath]);

    const result = await cli([...argv, "--config", configPath]);
    expect(result.code).toBe(2);
    expect(result.stderr).not.toBe("");

    expect((await cli(["config", "--config", configPath])).stdout).toContain(
      "port: 5050\n",
    );
  });

  it("reports an invalid config file and exits 1", async () => {
    await writeFile(configPath, "{ not json");

    const result = await cli(["config", "--config", configPath]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${configPath} is not valid JSON`);
  });

  it.each([
    ["port", "abc"],
    ["port", "70000"],
    ["port", undefined],
    ["open", "yes"],
    ["colour", "red"],
  ])("rejects config %s %s without writing", async (key, value) => {
    const argv = ["config", key, ...(value ? [value] : []), "--config", configPath];
    const result = await cli(argv);
    expect(result.code).not.toBe(0);
    expect(result.stderr).not.toBe("");

    expect((await cli(["config", "--config", configPath])).stdout).toContain(
      "port: 4747 (default)\nopen: true (default)",
    );
  });
});

describe("backscratcher add and remove", () => {
  const projects = () => openRegistry(configPath).list();

  it("adds the current directory, then reports it as already registered", async () => {
    const first = await cli(["add", "--config", configPath]);
    expect(first).toMatchObject({ code: 0, stdout: `added: ${projectDir}\n` });

    const again = await cli(["add", "--config", configPath]);
    expect(again).toMatchObject({ code: 0, stdout: `already registered: ${projectDir}\n` });
    expect(await projects()).toEqual([{ path: projectDir }]);
  });

  it("adds a relative path as an absolute path", async () => {
    await mkdir(path.join(projectDir, "nested"));

    const result = await cli(["add", "nested", "--config", configPath]);
    expect(result.stdout).toBe(`added: ${path.join(projectDir, "nested")}\n`);
    expect(await projects()).toEqual([{ path: path.join(projectDir, "nested") }]);
  });

  it("removes the current directory", async () => {
    await cli(["add", "--config", configPath]);

    const result = await cli(["remove", "--config", configPath]);
    expect(result).toMatchObject({ code: 0, stdout: `removed: ${projectDir}\n` });
    expect(await projects()).toEqual([]);
  });

  it.each([
    [["add", "missing"], `${path.join("<projectDir>", "missing")} is not a directory`],
    [["remove", "missing"], `${path.join("<projectDir>", "missing")} is not a registered Project`],
  ])("reports %j as one line, exiting 1", async (argv, message) => {
    const result = await cli([...argv, "--config", configPath]);
    expect(result).toMatchObject({
      code: 1,
      stderr: `backscratcher: ${message.replace("<projectDir>", projectDir)}\n`,
    });
  });

  it.each([
    [["add", "a", "b"]],
    [["remove", "a", "b"]],
    [["add", "--port", "5000"]],
    [["remove", "--no-open"]],
    [["add", "--unset"]],
  ])("rejects %j without changing the Projects", async (argv) => {
    const result = await cli([...argv, "--config", configPath]);
    expect(result.code).toBe(2);
    expect(result.stderr).not.toBe("");
    expect(await projects()).toEqual([]);
  });
});
