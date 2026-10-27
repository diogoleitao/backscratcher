import { parseArgs } from "node:util";
import {
  isSettingKey,
  openConfig,
  resolveConfigPath,
  SETTINGS,
  type SettingKey,
  type Settings,
} from "../config/config.ts";
import { ConfigError } from "../config/file.ts";
import { DEFAULT_TRACKER_FOLDER } from "../project-reader/project-reader.ts";
import {
  AlreadyRegisteredError,
  openRegistry,
  RegistryError,
  resolveProjectPath,
} from "../registry/registry.ts";
import { PortInUseError } from "../server/errors.ts";
import { resolveServerOptions, type ServerOptions } from "../server/options.ts";

export type CliDeps = {
  env: Record<string, string | undefined>;
  home: string;
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  startServer: (options: ServerOptions & { configPath: string }) => Promise<void>;
};

type Config = ReturnType<typeof openConfig>;
type Args = ReturnType<typeof parseCliArgs>;

class UsageError extends Error {}

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
    if (error instanceof PortInUseError) {
      deps.stderr(
        `backscratcher: ${error.message}. Stop whatever is using it, or start with --port <n> or set one with: backscratcher config port <n>\n`,
      );
      return 1;
    }
    if (
      error instanceof ConfigError ||
      error instanceof RegistryError ||
      isSystemError(error)
    ) {
      deps.stderr(`backscratcher: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

// One run of a command: the parsed flags, the arguments after the command
// name, and the config file the flags and environment point at.
type Invocation = {
  args: Args;
  operands: string[];
  config: Config;
  deps: CliDeps;
};

const COMMANDS: Record<string, (invocation: Invocation) => Promise<number>> = {
  add: runAdd,
  remove: runRemove,
  config: runConfig,
};

// `config <key> ...` for the keys kept per Project rather than as settings.
const PROJECT_CONFIG: Record<
  string,
  (invocation: Invocation, values: string[]) => Promise<number>
> = {
  tracker: runConfigTracker,
};

async function dispatch(argv: string[], deps: CliDeps): Promise<number> {
  const args = parseCliArgs(argv);
  const config = openConfig(
    resolveConfigPath({
      home: deps.home,
      envPath: deps.env.BACKSCRATCHER_CONFIG,
      flagPath: args.values.config,
    }),
  );
  const [command, ...operands] = args.positionals;
  const invocation = { args, operands, config, deps };

  if (command === undefined) return runStart(invocation);
  if (!Object.hasOwn(COMMANDS, command)) {
    throw new UsageError(`unknown command "${command}"`);
  }
  return COMMANDS[command](invocation);
}

async function runStart({ args, config, deps }: Invocation): Promise<number> {
  allowFlags(args, ["port", "no-open"], "start");
  const port =
    args.values.port === undefined ? undefined : parseSetting("port", args.values.port);
  const options = resolveServerOptions({
    flags: { port, open: args.values["no-open"] ? false : undefined },
    settings: await config.settings(),
  });
  await deps.startServer({ ...options, configPath: config.path });
  return 0;
}

async function runConfig(invocation: Invocation): Promise<number> {
  const { args, operands, config, deps } = invocation;
  allowFlags(args, ["unset"], "config");
  const [key, ...values] = operands;
  if (key !== undefined && Object.hasOwn(PROJECT_CONFIG, key)) {
    return PROJECT_CONFIG[key](invocation, values);
  }
  const [value, ...extra] = values;
  rejectExtra(extra);
  if (key === undefined) {
    allowFlags(args, [], "config without a setting");
    return runConfigPrint(config, deps);
  }
  return runConfigSet(config, key, value, args.values.unset ?? false);
}

async function runConfigPrint(config: Config, deps: CliDeps): Promise<number> {
  const settings = await config.settings();
  const projects = await openRegistry(config.path).list();
  const lines = [`config file: ${config.path}`];
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    lines.push(`${key}: ${settings[key] ?? `${SETTINGS[key].default} (default)`}`);
  }
  for (const project of projects) {
    const trackerFolder = project.trackerFolder ?? `${DEFAULT_TRACKER_FOLDER} (default)`;
    lines.push(`tracker ${project.path}: ${trackerFolder}`);
  }
  deps.stdout(`${lines.join("\n")}\n`);
  return 0;
}

// `config tracker <dir> [path]` and `config tracker --unset [path]`: the
// working directory's Project when no path is given.
async function runConfigTracker(
  { args, config, deps }: Invocation,
  values: string[],
): Promise<number> {
  const registry = openRegistry(config.path);
  if (args.values.unset) {
    const [target, ...extra] = values;
    rejectExtra(extra);
    await registry.clearTrackerFolder(resolveProjectPath(deps.cwd, target));
    return 0;
  }
  const [trackerFolder, target, ...extra] = values;
  if (trackerFolder === undefined) {
    throw new UsageError("config tracker takes a folder, or --unset");
  }
  rejectExtra(extra);
  await registry.setTrackerFolder(resolveProjectPath(deps.cwd, target), trackerFolder);
  return 0;
}

async function runConfigSet(
  config: Config,
  key: string,
  value: string | undefined,
  unset: boolean,
): Promise<number> {
  if (!isSettingKey(key)) {
    const known = [...Object.keys(SETTINGS), ...Object.keys(PROJECT_CONFIG)].join(" or ");
    throw new UsageError(`unknown setting "${key}" (expected ${known})`);
  }
  if (unset) {
    if (value !== undefined) throw new UsageError("--unset takes no value");
    await config.unset(key);
  } else {
    await config.set(key, parseSetting(key, value));
  }
  return 0;
}

function parseSetting<K extends SettingKey>(
  key: K,
  text: string | undefined,
): NonNullable<Settings[K]> {
  // TypeScript can't correlate SETTINGS[key] with Settings[K] for a generic K.
  const definition = SETTINGS[key] as {
    fromText(text: string): NonNullable<Settings[K]> | undefined;
  };
  const value = text === undefined ? undefined : definition.fromText(text);
  if (value === undefined) {
    throw new UsageError(
      `invalid ${key} "${text ?? ""}" (expected ${SETTINGS[key].expected})`,
    );
  }
  return value;
}

async function runAdd(invocation: Invocation): Promise<number> {
  const projectPath = parseProjectPath(invocation, "add", ["tracker"]);
  let result;
  try {
    result = await openRegistry(invocation.config.path).add(projectPath, {
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
  const removed = await openRegistry(invocation.config.path).remove(projectPath);
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
  return resolveProjectPath(deps.cwd, target);
}

function rejectExtra(extra: string[]): void {
  if (extra.length > 0) {
    throw new UsageError(`unexpected argument "${extra[0]}"`);
  }
}

const OPTIONS = {
  config: { type: "string" },
  port: { type: "string" },
  "no-open": { type: "boolean" },
  unset: { type: "boolean" },
  tracker: { type: "string" },
} as const;

// Every flag but --config, which every command takes.
type Flag = Exclude<keyof typeof OPTIONS, "config">;

const FLAGS = Object.keys(OPTIONS).filter((flag): flag is Flag => flag !== "config");

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
