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
import { openRegistry, RegistryError, resolveProjectPath } from "../registry/registry.ts";
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
  rejectFlags(args, ["unset"], "start");
  const port =
    args.values.port === undefined ? undefined : parseSetting("port", args.values.port);
  const options = resolveServerOptions({
    flags: { port, open: args.values["no-open"] ? false : undefined },
    settings: await config.settings(),
  });
  await deps.startServer({ ...options, configPath: config.path });
  return 0;
}

async function runConfig({ args, operands, config, deps }: Invocation): Promise<number> {
  rejectFlags(args, ["port", "no-open"], "config");
  const [key, value, ...extra] = operands;
  rejectExtra(extra);
  if (key === undefined) {
    rejectFlags(args, ["unset"], "config without a setting");
    return runConfigPrint(config, deps);
  }
  return runConfigSet(config, key, value, args.values.unset ?? false);
}

async function runConfigPrint(config: Config, deps: CliDeps): Promise<number> {
  const settings = await config.settings();
  const lines = [`config file: ${config.path}`];
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    lines.push(`${key}: ${settings[key] ?? `${SETTINGS[key].default} (default)`}`);
  }
  deps.stdout(`${lines.join("\n")}\n`);
  return 0;
}

async function runConfigSet(
  config: Config,
  key: string,
  value: string | undefined,
  unset: boolean,
): Promise<number> {
  if (!isSettingKey(key)) {
    const known = Object.keys(SETTINGS).join(" or ");
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
  const projectPath = parseProjectPath(invocation, "add");
  const { path, added } = await openRegistry(invocation.config.path).add(projectPath);
  invocation.deps.stdout(`${added ? "added" : "already registered"}: ${path}\n`);
  return 0;
}

async function runRemove(invocation: Invocation): Promise<number> {
  const projectPath = parseProjectPath(invocation, "remove");
  const removed = await openRegistry(invocation.config.path).remove(projectPath);
  invocation.deps.stdout(`removed: ${removed}\n`);
  return 0;
}

// `add [path]` and `remove [path]`: the working directory when no path is given.
function parseProjectPath({ args, operands, deps }: Invocation, command: string): string {
  rejectFlags(args, ["port", "no-open", "unset"], command);
  const [target, ...extra] = operands;
  rejectExtra(extra);
  return resolveProjectPath(deps.cwd, target);
}

function rejectExtra(extra: string[]): void {
  if (extra.length > 0) {
    throw new UsageError(`unexpected argument "${extra[0]}"`);
  }
}

function rejectFlags(
  args: Args,
  flags: ("port" | "no-open" | "unset")[],
  context: string,
): void {
  const given = flags.find((flag) => args.values[flag] !== undefined);
  if (given) throw new UsageError(`--${given} is not valid with ${context}`);
}

function parseCliArgs(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        config: { type: "string" },
        port: { type: "string" },
        "no-open": { type: "boolean" },
        unset: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}
