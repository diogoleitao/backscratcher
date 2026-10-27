import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerOptions } from "../server/options.js";
import { runCli } from "./run.js";

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "backscratcher-cli-"));
  configPath = path.join(dir, "config.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function cli(argv: string[], env: Record<string, string> = {}) {
  let stdout = "";
  let stderr = "";
  const started: ServerOptions[] = [];
  const code = await runCli(argv, {
    env,
    home: path.join(dir, "home"),
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    startServer: async (options) => {
      started.push(options);
    },
  });
  return { code, stdout, stderr, started };
}

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
