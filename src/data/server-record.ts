import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { isPlainObject } from "../config/file.ts";
import { ifExists, writeFileAtomically } from "../fs.ts";

// The server `backscratcher start` left running in the background.
export type ServerRecord = {
  pid: number;
  url: string;
};

function isServerRecord(value: unknown): value is ServerRecord {
  return isPlainObject(value) && typeof value.pid === "number" && typeof value.url === "string";
}

export function defaultDataDir(home: string): string {
  return path.join(home, ".local", "share", "backscratcher");
}

export function openServerRecord(dataDir: string) {
  const recordPath = path.join(dataDir, "server.json");
  return {
    // A file that does not hold a record, such as invalid JSON or `null`,
    // names no server, so it reads as none.
    async load(): Promise<ServerRecord | undefined> {
      const text = await ifExists(readFile(recordPath, "utf8"));
      if (text === undefined) return undefined;
      let record: unknown;
      try {
        record = JSON.parse(text);
      } catch {
        return undefined;
      }
      return isServerRecord(record) ? record : undefined;
    },

    async save(record: ServerRecord): Promise<void> {
      await writeFileAtomically(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    },

    async clear(): Promise<void> {
      await rm(recordPath, { force: true });
    },
  };
}
