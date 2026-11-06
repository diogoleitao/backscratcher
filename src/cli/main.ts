#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfigPath } from "../config/config.ts";
import { defaultDataDir } from "../data/server-record.ts";
import { runCli } from "./run.ts";

const HOST = "127.0.0.1";
const PORT = 1795;

// dist/cli/main.js -> package root, where the Next.js build lives.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

process.exitCode = await runCli(process.argv.slice(2), {
  configPath: defaultConfigPath(homedir()),
  dataDir: defaultDataDir(homedir()),
  url: `http://${HOST}:${PORT}`,
  server: {
    command: process.execPath,
    args: [nextBin, "start", "--hostname", HOST, "--port", String(PORT)],
    cwd: packageRoot,
  },
  startTimeoutMs: 60_000,
  platform: process.platform,
  cwd: () => process.cwd(),
  openBrowser,
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
});

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { detached: true, stdio: "ignore" });
  child.on("error", () => void process.stdout.write(`open ${url} in your browser\n`));
  child.unref();
}
