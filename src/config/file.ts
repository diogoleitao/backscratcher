import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";

export class ConfigError extends Error {}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The app's own config file, shared by the settings and the Project registry.
// Each section's owner validates its section after loading.
export type ConfigFile = Record<string, unknown>;

export function openConfigFile(configPath: string) {
  return {
    path: configPath,

    async load(): Promise<ConfigFile> {
      const text = await ifExists(readFile(configPath, "utf8"));
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

    // Writes a temp file beside the config file, then renames it over, so a
    // reader never sees a half-written file. A symlinked config file is
    // written at its target, keeping the link. Two writers at once can still
    // lose one write: the last rename wins.
    async save(config: ConfigFile): Promise<void> {
      const target = (await ifExists(realpath(configPath))) ?? configPath;
      await mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.tmp`;
      try {
        await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`);
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },

    error(message: string): ConfigError {
      return new ConfigError(`config file ${configPath}: ${message}`);
    },
  };
}
