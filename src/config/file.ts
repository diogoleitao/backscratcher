import { lstat, readFile, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ifExists, writeFileAtomically } from "../fs.ts";

export class ConfigError extends Error {}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The app's own config file, holding the Project registry. Each section's
// owner validates its section after loading, and sections nobody owns are
// kept as they are.
export type ConfigFile = Record<string, unknown>;

// Linux's limit on links followed in one path before ELOOP; macOS stops at 32.
const MAX_SYMLINK_HOPS = 40;

function loopError(configPath: string): ConfigError {
  return new ConfigError(
    `config file ${configPath} is a symlink loop or too long a chain of links`,
  );
}

// Where a write to the config file lands: the end of its symlink chain,
// which need not exist yet (a dotfiles link on a new machine).
async function writeTarget(configPath: string): Promise<string> {
  let target = configPath;
  for (let hops = 0; hops < MAX_SYMLINK_HOPS; hops++) {
    const stats = await ifExists(lstat(target));
    if (!stats?.isSymbolicLink()) return target;
    // A relative link is relative to the real folder holding it.
    const folder = path.dirname(target);
    target = path.resolve((await ifExists(realpath(folder))) ?? folder, await readlink(target));
  }
  throw loopError(configPath);
}

export function openConfigFile(configPath: string) {
  return {
    path: configPath,

    // A loop is not a missing file: read as empty, the next save would write
    // over the file at the end of a chain the OS stopped following.
    async load(): Promise<ConfigFile> {
      const text = await ifExists(
        readFile(configPath, "utf8").catch((error: NodeJS.ErrnoException) => {
          throw error.code === "ELOOP" ? loopError(configPath) : error;
        }),
      );
      if (text === undefined) return {};

      let config: unknown;
      try {
        config = JSON.parse(text);
      } catch {
        throw new ConfigError(`config file ${configPath} is not valid JSON`);
      }
      if (!isPlainObject(config)) {
        throw new ConfigError(`config file ${configPath} must hold a JSON object`);
      }
      return config;
    },

    // Written atomically, keeping the file's mode. A symlinked config file is
    // written at its target, keeping the link. Saves at once in one process
    // (the server) do not collide, but two writers at once can still lose one
    // write: the last rename wins.
    async save(config: ConfigFile): Promise<void> {
      const target = await writeTarget(configPath);
      const mode = (await ifExists(stat(target)))?.mode;
      await writeFileAtomically(target, `${JSON.stringify(config, null, 2)}\n`, mode);
    },

    error(message: string): ConfigError {
      return new ConfigError(`config file ${configPath}: ${message}`);
    },
  };
}
