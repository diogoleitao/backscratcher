import path from "node:path";
import { type ConfigError, isPlainObject, openConfigFile } from "./file.ts";

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

export function openConfig(configPath: string) {
  const file = openConfigFile(configPath);
  const { save } = file;

  async function load() {
    const config = await file.load();
    const settings = config.settings === undefined ? {} : config.settings;
    if (!isPlainObject(settings)) {
      throw file.error("settings must be a JSON object");
    }
    return { config, settings };
  }

  function invalid(key: SettingKey, value: unknown): ConfigError {
    return file.error(
      `invalid ${key} ${JSON.stringify(value)} (expected ${SETTINGS[key].expected})`,
    );
  }

  return {
    path: configPath,

    async settings(): Promise<Settings> {
      const stored = (await load()).settings;
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
      const { config, settings } = await load();
      await save({ ...config, settings: { ...settings, [key]: value } });
    },

    async unset(key: SettingKey): Promise<void> {
      const { config, settings } = await load();
      const { [key]: _removed, ...kept } = settings;
      await save({ ...config, settings: kept });
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
