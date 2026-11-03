import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ifExists, writeFileAtomically } from "../fs.ts";

// The server `backscratcher start` left running in the background.
export type ServerRecord = {
  pid: number;
  url: string;
};

export function defaultDataDir(home: string): string {
  return path.join(home, ".local", "share", "backscratcher");
}

export function openServerRecord(dataDir: string) {
  const recordPath = path.join(dataDir, "server.json");
  return {
    // A record that is not valid JSON names no server, so it reads as none.
    async load(): Promise<ServerRecord | undefined> {
      const text = await ifExists(readFile(recordPath, "utf8"));
      if (text === undefined) return undefined;
      try {
        return JSON.parse(text) as ServerRecord;
      } catch {
        return undefined;
      }
    },

    async save(record: ServerRecord): Promise<void> {
      await writeFileAtomically(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    },

    async clear(): Promise<void> {
      await rm(recordPath, { force: true });
    },
  };
}
