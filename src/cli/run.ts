import path from "node:path";
import { parseArgs } from "node:util";
import { ConfigError } from "../config/file.ts";
import { openServerRecord } from "../data/server-record.ts";
import { DEFAULT_TRACKER_FOLDER } from "../project-reader/project-reader.ts";
import {
  AlreadyRegisteredError,
  openRegistry,
  RegistryError,
  resolveProjectPath,
} from "../registry/registry.ts";
import {
  isAnswering,
  liveServer,
  serverLog,
  spawnServer,
  stopProcessGroup,
  waitUntilAnswering,
} from "./background-server.ts";

export type CliDeps = {
  configPath: string;
  dataDir: string;
  url: string;
  // What runs the server; it must listen on `url`.
  server: { command: string; args: string[]; cwd: string };
  // How long `backscratcher start` waits for the server to answer before stopping it.
  startTimeoutMs: number;
  platform: NodeJS.Platform;
  // Read only when a command needs it: the shell's folder may have been deleted.
  cwd: () => string;
  openBrowser: (url: string) => void;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

type Args = ReturnType<typeof parseCliArgs>;

class UsageError extends Error {}

class WorkingDirectoryError extends Error {
  // instead: what to pass in place of a path relative to the working directory.
  constructor(instead: string) {
    super(`the working directory no longer exists; cd into a folder, or pass ${instead}`);
  }
}

function workingDirectory(deps: CliDeps, instead: string): string {
  try {
    return deps.cwd();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new WorkingDirectoryError(instead);
    }
    throw error;
  }
}

// Node's errors from the file system and sockets (EISDIR, EACCES, ...).
function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    /^E[A-Z]+$/.test((error as NodeJS.ErrnoException).code!)
  );
}

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  try {
    return await dispatch(argv, deps);
  } catch (error) {
    if (error instanceof UsageError) {
      deps.stderr(`backscratcher: ${error.message}\n`);
      return 2;
    }
    if (
      error instanceof ConfigError ||
      error instanceof RegistryError ||
      error instanceof WorkingDirectoryError ||
      isSystemError(error)
    ) {
      deps.stderr(`backscratcher: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

// One run of a command: the parsed flags and the arguments after the command
// name.
type Invocation = {
  args: Args;
  operands: string[];
  deps: CliDeps;
};

const COMMANDS: Record<string, (invocation: Invocation) => Promise<number>> = {
  start: unlessWindows("start", runStart),
  stop: unlessWindows("stop", runStop),
  add: runAdd,
  remove: runRemove,
  config: runConfig,
};

// `config <key> ...`: every key is kept per Project, in the Project registry.
const PROJECT_CONFIG: Record<
  string,
  (invocation: Invocation, values: string[]) => Promise<number>
> = {
  tracker: runConfigTracker,
};

async function dispatch(argv: string[], deps: CliDeps): Promise<number> {
  const args = parseCliArgs(argv);
  const [command, ...operands] = args.positionals;
  if (command === undefined) {
    deps.stderr(USAGE);
    return 2;
  }
  if (!Object.hasOwn(COMMANDS, command)) {
    throw new UsageError(`unknown command "${command}"`);
  }
  return COMMANDS[command]({ args, operands, deps });
}

// The background server is stopped through its process group, which Windows
// does not have.
function unlessWindows(
  command: string,
  run: (invocation: Invocation) => Promise<number>,
): (invocation: Invocation) => Promise<number> {
  return async (invocation) => {
    if (invocation.deps.platform !== "win32") return run(invocation);
    invocation.deps.stderr(`backscratcher: ${command} is not supported on Windows\n`);
    return 1;
  };
}

const USAGE =
  "usage: backscratcher start | stop | add [path] | remove [path] | config [tracker ...]\n";

async function runStart({ args, operands, deps }: Invocation): Promise<number> {
  allowFlags(args, [], "start");
  rejectExtra(operands);
  const recordFile = openServerRecord(deps.dataDir);
  const live = await liveServer(recordFile);
  if (live !== undefined) {
    deps.stdout(`backscratcher running at ${live.url}\n`);
    deps.openBrowser(live.url);
    return 0;
  }

  // Otherwise the new server would fail to listen while `url` still answered.
  if (await isAnswering(deps.url)) {
    deps.stderr(`backscratcher: ${deps.url} is already in use\n`);
    return 1;
  }
  const server = await spawnServer(deps);
  const outcome = await waitUntilAnswering(deps, server);
  if (outcome === "exited") {
    deps.stderr(
      `backscratcher: the server exited before it answered; see ${serverLog(deps.dataDir)}\n`,
    );
    return 1;
  }
  if (outcome === "timed out") {
    await stopProcessGroup(server.pid!);
    deps.stderr(
      `backscratcher: the server did not answer on ${deps.url} within ${deps.startTimeoutMs / 1000} seconds; see ${serverLog(deps.dataDir)}\n`,
    );
    return 1;
  }
  await recordFile.save({ pid: server.pid!, url: deps.url });
  deps.stdout(`backscratcher running at ${deps.url}\n`);
  deps.openBrowser(deps.url);
  return 0;
}

async function runStop({ args, operands, deps }: Invocation): Promise<number> {
  allowFlags(args, [], "stop");
  rejectExtra(operands);
  const recordFile = openServerRecord(deps.dataDir);
  const live = await liveServer(recordFile);
  const stopped = live !== undefined && (await stopProcessGroup(live.pid));
  await recordFile.clear();
  deps.stdout(stopped ? "backscratcher stopped\n" : "backscratcher is not running\n");
  return 0;
}

async function runConfig(invocation: Invocation): Promise<number> {
  const { args, operands, deps } = invocation;
  allowFlags(args, ["unset"], "config");
  const [key, ...values] = operands;
  if (key === undefined) {
    allowFlags(args, [], "config without a setting");
    return runConfigPrint(deps);
  }
  if (!Object.hasOwn(PROJECT_CONFIG, key)) {
    const known = Object.keys(PROJECT_CONFIG).join(" or ");
    throw new UsageError(`unknown setting "${key}" (expected ${known})`);
  }
  return PROJECT_CONFIG[key](invocation, values);
}

async function runConfigPrint(deps: CliDeps): Promise<number> {
  // Printed before the Projects are read, so an invalid Project still shows
  // the config file above the error.
  deps.stdout(`config file: ${deps.configPath}\n`);
  for (const project of await openRegistry(deps.configPath).list()) {
    const trackerFolder = project.trackerFolder ?? `${DEFAULT_TRACKER_FOLDER} (default)`;
    deps.stdout(`tracker ${project.path}: ${trackerFolder}\n`);
  }
  return 0;
}

// `config tracker <dir> [path]` and `config tracker --unset [path]`: the
// working directory's Project when no path is given.
async function runConfigTracker(
  { args, deps }: Invocation,
  values: string[],
): Promise<number> {
  const registry = openRegistry(deps.configPath);
  if (args.values.unset) {
    const [target, ...extra] = values;
    rejectExtra(extra);
    await registry.clearTrackerFolder(projectPathOf(deps, target));
    return 0;
  }
  const [trackerFolder, target, ...extra] = values;
  if (trackerFolder === undefined) {
    throw new UsageError("config tracker takes a folder, or --unset");
  }
  rejectExtra(extra);
  await registry.setTrackerFolder(projectPathOf(deps, target), trackerFolder);
  return 0;
}

// The Project a path argument names, the working directory when none is
// given. An absolute path does not read the working directory, so it still
// works after that folder was deleted.
function projectPathOf(deps: CliDeps, target: string | undefined): string {
  if (target !== undefined && path.isAbsolute(target)) return path.resolve(target);
  return resolveProjectPath(workingDirectory(deps, "the Project's absolute path"), target);
}

async function runAdd(invocation: Invocation): Promise<number> {
  const projectPath = parseProjectPath(invocation, "add", ["tracker"]);
  let result;
  try {
    result = await openRegistry(invocation.deps.configPath).add(projectPath, {
      trackerFolder: invocation.args.values.tracker,
    });
  } catch (error) {
    if (!(error instanceof AlreadyRegisteredError)) throw error;
    throw new RegistryError(
      `${error.message}; set its Tracker folder with: backscratcher config tracker <dir> [path]`,
    );
  }
  invocation.deps.stdout(`${result.added ? "added" : "already registered"}: ${result.path}\n`);
  return 0;
}

async function runRemove(invocation: Invocation): Promise<number> {
  const projectPath = parseProjectPath(invocation, "remove", []);
  const removed = await openRegistry(invocation.deps.configPath).remove(projectPath);
  invocation.deps.stdout(`removed: ${removed}\n`);
  return 0;
}

// `add [path]` and `remove [path]`: the working directory when no path is given.
function parseProjectPath(
  { args, operands, deps }: Invocation,
  command: string,
  allowed: Flag[],
): string {
  allowFlags(args, allowed, command);
  const [target, ...extra] = operands;
  rejectExtra(extra);
  return projectPathOf(deps, target);
}

function rejectExtra(extra: string[]): void {
  if (extra.length > 0) {
    throw new UsageError(`unexpected argument "${extra[0]}"`);
  }
}

const OPTIONS = {
  unset: { type: "boolean" },
  tracker: { type: "string" },
} as const;

type Flag = keyof typeof OPTIONS;

const FLAGS = Object.keys(OPTIONS) as Flag[];

// Rejects the first flag given that the command does not take.
function allowFlags(args: Args, allowed: Flag[], context: string): void {
  const given = FLAGS.find((flag) => !allowed.includes(flag) && args.values[flag] !== undefined);
  if (given) throw new UsageError(`--${given} is not valid with ${context}`);
}

function parseCliArgs(argv: string[]) {
  try {
    return parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}
