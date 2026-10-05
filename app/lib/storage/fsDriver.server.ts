import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import type { StorageDriver, StoredObject } from "./types";

export function createFsDriver(root: string): StorageDriver {
  const resolve = (key: string) => path.join(root, key);

  const isMissing = (err: unknown) =>
    (err as NodeJS.ErrnoException)?.code === "ENOENT";

  return {
    describe: `fs:${root}`,

    async readJson<T>(key: string): Promise<T | null> {
      try {
        return JSON.parse(await readFile(resolve(key), "utf-8")) as T;
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },

    async writeJson(key: string, value: unknown): Promise<void> {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.tmp`;
      await writeFile(tmp, JSON.stringify(value), "utf-8");
      await rename(tmp, target);
    },

    async list(prefix: string): Promise<StoredObject[]> {
      const dir = resolve(prefix);
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (isMissing(err)) return [];
        throw err;
      }

      const objects: StoredObject[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith(".tmp")) continue;
        try {
          const info = await stat(path.join(dir, entry.name));
          objects.push({
            key: `${prefix}${entry.name}`,
            size: info.size,
            updatedAtMs: info.mtimeMs,
          });
        } catch (err) {
          if (!isMissing(err)) throw err;
        }
      }
      return objects;
    },

    async remove(key: string): Promise<void> {
      try {
        await unlink(resolve(key));
      } catch (err) {
        if (!isMissing(err)) throw err;
      }
    },
  };
}
