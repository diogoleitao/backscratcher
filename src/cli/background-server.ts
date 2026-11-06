import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import type { openServerRecord, ServerRecord } from "../data/server-record.ts";
import type { CliDeps } from "./run.ts";

const STOP_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 1_000;

type ServerRecordFile = ReturnType<typeof openServerRecord>;

// The recorded server, when its process is there and its URL answers. A pid
// alone is not enough: once the server is gone, the system can give its pid to
// another process.
export async function liveServer(
  recordFile: ServerRecordFile,
): Promise<ServerRecord | undefined> {
  const recorded = await recordFile.load();
  if (recorded === undefined || !isAlive(recorded.pid)) return undefined;
  return (await isAnswering(recorded.url)) ? recorded : undefined;
}

// Asks the server's process group to stop, and kills it if it is still there
// after STOP_TIMEOUT_MS. Gives false when there is no such process group.
export async function stopProcessGroup(pid: number): Promise<boolean> {
  if (!signalGroup(pid, "SIGTERM")) return false;
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (isAlive(pid)) {
    if (Date.now() > deadline) {
      signalGroup(pid, "SIGKILL");
      break;
    }
    await sleep(100);
  }
  return true;
}

function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

// EPERM means the process exists but belongs to another user.
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Starts the server in its own process group, detached from this one, with
// its output going to server.log in the data directory.
export async function spawnServer({
  dataDir,
  server,
}: Pick<CliDeps, "dataDir" | "server">): Promise<ChildProcess> {
  await mkdir(dataDir, { recursive: true });
  const log = await open(serverLog(dataDir), "a");
  try {
    const child = spawn(server.command, server.args, {
      cwd: server.cwd,
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
    });
    child.unref();
    return child;
  } finally {
    await log.close();
  }
}

export function serverLog(dataDir: string): string {
  return path.join(dataDir, "server.log");
}

// Waits until `url` answers, the server exits, or startTimeoutMs passes. The
// server sits in its own process group, so Ctrl-C does not reach it: it is
// stopped here instead of being left running with no record.
export async function waitUntilAnswering(
  { url, startTimeoutMs }: Pick<CliDeps, "url" | "startTimeoutMs">,
  server: ChildProcess,
): Promise<"answering" | "exited" | "timed out"> {
  const interrupt = () => {
    signalGroup(server.pid!, "SIGTERM");
    process.exit(130);
  };
  process.once("SIGINT", interrupt);
  try {
    const deadline = Date.now() + startTimeoutMs;
    while (server.exitCode === null && server.signalCode === null) {
      if (await isAnswering(url)) return "answering";
      if (Date.now() > deadline) return "timed out";
      await sleep(100);
    }
    return "exited";
  } finally {
    process.off("SIGINT", interrupt);
  }
}

// A listener that accepts the connection but never sends headers would
// otherwise hold each probe for undici's 300-second headers timeout. A
// redirect counts as an answer: following the app's `/` would render the
// first Project's page, which can take longer than the probe allows.
export async function isAnswering(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}
