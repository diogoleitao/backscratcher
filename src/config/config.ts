import path from "node:path";

export function defaultConfigPath(home: string): string {
  return path.join(home, ".config", "backscratcher", "config.json");
}
