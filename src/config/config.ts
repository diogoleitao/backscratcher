import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Settings = {
  port?: number;
  open?: boolean;
};

export type SettingKey = keyof Settings;

type SettingDefinition<T> = {
  default: T;
  expected: string;
  fromText(text: string): T | undefined;
  accepts(value: unknown): value is T;
};

function isPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}

// Every setting the config file and `backscratcher config` know about.
export const SETTINGS: {
  [K in SettingKey]-?: SettingDefinition<NonNullable<Settings[K]>>;
} = {
  port: {
    default: 4747,
    expected: "an integer from 1 to 65535",
    fromText: (text) => {
      const port = /^\d+$/.test(text) ? Number(text) : NaN;
      return isPort(port) ? port : undefined;
    },
    accepts: isPort,
  },
  open: {
    default: true,
    expected: "true or false",
    fromText: (text) =>
      text === "true" ? true : text === "false" ? false : undefined,
    accepts: (value): value is boolean => typeof value === "boolean",
  },
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

export class ConfigError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ConfigFile = {
  settings?: Record<string, unknown>;
};

export function openConfig(configPath: string) {
  async function load(): Promise<ConfigFile> {
    let text: string;
    try {
      text = await readFile(configPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }

    let config: unknown;
    try {
      config = JSON.parse(text);
    } catch {
      throw new ConfigError(`config file ${configPath} is not valid JSON`);
    }
    if (!isPlainObject(config)) {
      throw new ConfigError(`config file ${configPath} must hold a JSON object`);
    }
    if (config.settings !== undefined && !isPlainObject(config.settings)) {
      throw new ConfigError(
        `config file ${configPath}: settings must be a JSON object`,
      );
    }
    return config as ConfigFile;
  }

  async function save(config: ConfigFile): Promise<void> {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }

  function invalid(key: SettingKey, value: unknown): ConfigError {
    return new ConfigError(
      `config file ${configPath}: invalid ${key} ${JSON.stringify(value)} (expected ${SETTINGS[key].expected})`,
    );
  }

  return {
    async settings(): Promise<Settings> {
      const stored = (await load()).settings ?? {};
      const settings: Record<string, unknown> = {};
      for (const key of Object.keys(SETTINGS) as SettingKey[]) {
        const value = stored[key];
        if (value === undefined) continue;
        if (!SETTINGS[key].accepts(value)) throw invalid(key, value);
        settings[key] = value;
      }
      return settings as Settings;
    },

    async set(key: SettingKey, value: unknown): Promise<void> {
      if (!SETTINGS[key].accepts(value)) throw invalid(key, value);
      const config = await load();
      await save({ ...config, settings: { ...config.settings, [key]: value } });
    },

    async unset(key: SettingKey): Promise<void> {
      const config = await load();
      const { [key]: _removed, ...settings } = config.settings ?? {};
      await save({ ...config, settings });
    },
  };
}

export function resolveConfigPath(options: {
  home: string;
  envPath?: string;
  flagPath?: string;
}): string {
  return (
    options.flagPath ||
    options.envPath ||
    path.join(options.home, ".config", "backscratcher", "config.json")
  );
}
