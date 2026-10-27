// Runs a file system operation, giving undefined when the path does not exist.
export async function ifExists<T>(operation: Promise<T>): Promise<T | undefined> {
  try {
    return await operation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
