#!/usr/bin/env node
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PortInUseError, startServer } from "../server/start.js";
import { runCli } from "./run.js";

// dist/cli/main.js -> package root, where the Next.js build lives.
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const stdout = (text: string) => void process.stdout.write(text);
const stderr = (text: string) => void process.stderr.write(text);

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    env: process.env,
    home: homedir(),
    stdout,
    stderr,
    startServer: (options) => startServer({ ...options, appDir, log: stdout }),
  });
} catch (error) {
  if (!(error instanceof PortInUseError)) throw error;
  stderr(
    `backscratcher: ${error.message}. Stop whatever is using it, or start with --port <n> or set one with: backscratcher config port <n>\n`,
  );
  process.exitCode = 1;
}
