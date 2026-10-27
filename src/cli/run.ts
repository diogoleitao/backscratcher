import { parseArgs } from "node:util";
import {
  ConfigError,
  isSettingKey,
  openConfig,
  resolveConfigPath,
  SETTINGS,
  type SettingKey,
  type Settings,
} from "../config/config.js";
import { PortInUseError } from "../server/errors.js";
import { resolveServerOptions, type ServerOptions } from "../server/options.js";

export type CliDeps = {
  env: Record<string, string | undefined>;
  home: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  startServer: (options: ServerOptions) => Promise<void>;
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
    if (error instanceof ConfigError || isSystemError(error)) {
      deps.stderr(`backscratcher: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

async function dispatch(argv: string[], deps: CliDeps): Promise<number> {
  const args = parseCliArgs(argv);
  const configPath = resolveConfigPath({
    home: deps.home,
    envPath: deps.env.BACKSCRATCHER_CONFIG,
    flagPath: args.values.config,
  });
  const config = openConfig(configPath);
  const [command, ...rest] = args.positionals;

  if (command === undefined) return runStart(config, args, deps);
  if (command !== "config") {
    throw new UsageError(`unknown command "${command}"`);
  }

  rejectFlags(args, ["port", "no-open"], "config");
  const [key, value, ...extra] = rest;
  if (extra.length > 0) {
    throw new UsageError(`unexpected argument "${extra[0]}"`);
  }
  if (key === undefined) {
    rejectFlags(args, ["unset"], "config without a setting");
    return runConfigPrint(config, configPath, deps);
  }
  return runConfigSet(config, key, value, args.values.unset ?? false);
}

async function runStart(config: Config, args: Args, deps: CliDeps): Promise<number> {
  rejectFlags(args, ["unset"], "start");
  const port =
    args.values.port === undefined ? undefined : parseSetting("port", args.values.port);
  const options = resolveServerOptions({
    flags: { port, open: args.values["no-open"] ? false : undefined },
    settings: await config.settings(),
  });
  await deps.startServer(options);
  return 0;
}

async function runConfigPrint(
  config: Config,
  configPath: string,
  deps: CliDeps,
): Promise<number> {
  const settings = await config.settings();
  const lines = [`config file: ${configPath}`];
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
