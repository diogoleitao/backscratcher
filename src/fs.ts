import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Runs a file system operation, giving undefined when the path does not exist.
export async function ifExists<T>(operation: Promise<T>): Promise<T | undefined> {
  try {
    return await operation;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return undefined;
    throw error;
  }
}

// Writes a temp file beside the target, then renames it over, so a reader
// never sees a half-written file. Each write has its own temp file, so writes
// at once in one process do not collide; the last rename wins.
export async function writeFileAtomically(
  target: string,
  contents: string,
  // The mode the target should keep. The rename replaces the file, so the temp
  // file takes on its mode. It is created with it, so a 0600 file is never
  // readable by others; the chmod restores what the umask took off.
  mode?: number,
): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, contents, { mode: mode === undefined ? undefined : mode & 0o777 });
    if (mode !== undefined) await chmod(temp, mode & 0o7777);
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
