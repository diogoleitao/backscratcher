import { mkdir, readFile, writeFile } from "node:fs/promises";
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

    async save(config: ConfigFile): Promise<void> {
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    },

    error(message: string): ConfigError {
      return new ConfigError(`config file ${configPath}: ${message}`);
    },
  };
}
