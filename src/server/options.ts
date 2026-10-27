import { SETTINGS, type Settings } from "../config/config.ts";

export type ServerOptions = Required<Settings>;

export function resolveServerOptions(input: {
  flags: Settings;
  settings: Settings;
}): ServerOptions {
  const { flags, settings } = input;
  return {
    port: flags.port ?? settings.port ?? SETTINGS.port.default,
    open: flags.open ?? settings.open ?? SETTINGS.open.default,
  };
}
