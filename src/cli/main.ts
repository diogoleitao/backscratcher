#!/usr/bin/env node
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/start.js";
import { runCli } from "./run.js";

// dist/cli/main.js -> package root, where the Next.js build lives.
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const stdout = (text: string) => void process.stdout.write(text);

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  home: homedir(),
  stdout,
  stderr: (text) => void process.stderr.write(text),
  startServer: (options) => startServer({ ...options, appDir, log: stdout }),
});
