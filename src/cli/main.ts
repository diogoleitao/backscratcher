#!/usr/bin/env node
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/start.ts";
import { runCli } from "./run.ts";

// dist/cli/main.js -> package root, where the Next.js build lives.
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const stdout = (text: string) => void process.stdout.write(text);

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  home: homedir(),
  cwd: () => process.cwd(),
  stdout,
  stderr: (text) => void process.stderr.write(text),
  startServer: ({ configPath, ...options }) => {
    // The app runs in this process and reads the Project registry from the
    // config file the CLI resolved, including one given with --config.
    process.env.BACKSCRATCHER_CONFIG = configPath;
    // Next reads the working directory on every request, so a deleted one
    // would fail every page.
    try {
      process.cwd();
    } catch {
      process.chdir(appDir);
    }
    return startServer({ ...options, appDir, log: stdout });
  },
});
