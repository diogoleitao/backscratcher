import { type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { ifExists } from "../fs.ts";
import { type WatchedFolder, watchedFolders } from "../project-reader/project-reader.ts";

// Changes on disk often come in bursts, such as an editor's write and rename.
// A burst that never settles, such as steady writes under a watched Project
// root, still reports once MAX_WAIT_MS after it started.
const SETTLE_MS = 100;
const MAX_WAIT_MS = 1000;

// A folder found on disk, with its inode to tell a remade folder apart.
type FoundFolder = WatchedFolder & { ino: number };

type ActiveWatch = FoundFolder & { watcher: FSWatcher };

// The folder to watch for a target: the target itself, or while it is missing,
// its nearest existing ancestor, so its creation is seen.
async function existingFolder(target: WatchedFolder): Promise<FoundFolder | undefined> {
  let folderPath = target.path;
  for (;;) {
    const info = await ifExists(stat(folderPath));
    if (info?.isDirectory()) {
      const recursive = folderPath === target.path && target.recursive;
      return { path: folderPath, ino: info.ino, recursive };
    }
    const parent = path.dirname(folderPath);
    if (parent === folderPath) return undefined;
    folderPath = parent;
  }
}

// Calls onChange, once per burst, after anything readProject reads may have
// changed. Only reads the Project. Resolves once the watch is in place, to a
// function that stops watching.
export async function watchProject(
  projectPath: string,
  options: { trackerFolder?: string },
  onChange: () => void,
): Promise<() => void> {
  const targets = watchedFolders(projectPath, options);
  const active: (ActiveWatch | undefined)[] = targets.map(() => undefined);
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let burstStart: number | undefined;
  let syncing = Promise.resolve();

  const scheduleChange = () => {
    if (stopped) return;
    burstStart ??= Date.now();
    clearTimeout(timer);
    const delay = Math.min(SETTLE_MS, burstStart + MAX_WAIT_MS - Date.now());
    timer = setTimeout(() => {
      burstStart = undefined;
      syncing = syncing.then(syncQuietly).then(() => {
        if (!stopped) onChange();
      });
    }, Math.max(0, delay));
  };

  // A folder that cannot be read, such as one without permission, stays
  // unwatched; the read that follows reports it.
  const syncQuietly = () => sync().catch(() => undefined);

  // Moves each watch to where its target now is. A folder that was deleted and
  // made again has a new inode, and the old watch no longer sees it.
  async function sync(): Promise<void> {
    for (const [index, target] of targets.entries()) {
      const folder = await existingFolder(target);
      const current = active[index];
      if (
        current !== undefined &&
        folder !== undefined &&
        current.path === folder.path &&
        current.ino === folder.ino &&
        current.recursive === folder.recursive
      ) {
        continue;
      }
      current?.watcher.close();
      active[index] = undefined;
      if (folder === undefined || stopped) continue;
      try {
        const watcher = watch(folder.path, { recursive: folder.recursive }, scheduleChange);
        // A watch that errored sees nothing more, so the next sync replaces it.
        watcher.on("error", () => {
          watcher.close();
          if (active[index]?.watcher === watcher) active[index] = undefined;
          scheduleChange();
        });
        active[index] = { ...folder, watcher };
      } catch {
        // The folder went away between the stat and the watch.
        scheduleChange();
      }
    }
  }

  syncing = syncQuietly();
  await syncing;
  return () => {
    stopped = true;
    clearTimeout(timer);
    syncing = syncing.then(() => {
      for (const current of active) current?.watcher.close();
    });
  };
}
