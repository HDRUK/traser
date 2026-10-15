import { Storage } from "@google-cloud/storage";
import type { StorageDriver, StoredObject } from "./types";

function isNotFound(err: unknown): boolean {
  return (err as { code?: number })?.code === 404;
}

export function createGcsDriver(bucketName: string, objectPrefix: string): StorageDriver {
  const bucket = new Storage().bucket(bucketName);
  const objectName = (key: string) => `${objectPrefix}${key}`;

  return {
    describe: `gcs:${bucketName}/${objectPrefix}`,

    async readJson<T>(key: string): Promise<T | null> {
      try {
        const [contents] = await bucket.file(objectName(key)).download();
        return JSON.parse(contents.toString("utf-8")) as T;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async writeJson(key: string, value: unknown): Promise<void> {
      await bucket.file(objectName(key)).save(JSON.stringify(value), {
        contentType: "application/json",
        resumable: false,
      });
    },

    // delimiter keeps this non-recursive, so listing the root does not also
    // enumerate benchmark/ objects as if they were dataset files.
    async list(prefix: string): Promise<StoredObject[]> {
      const [files] = await bucket.getFiles({
        prefix: objectName(prefix),
        delimiter: "/",
      });

      return files
        .filter((file) => !file.name.endsWith("/"))
        .map((file) => ({
          key: file.name.slice(objectPrefix.length),
          size: Number(file.metadata.size ?? 0),
          updatedAtMs: Date.parse(String(file.metadata.updated ?? "")) || 0,
        }));
    },

    async remove(key: string): Promise<void> {
      try {
        await bucket.file(objectName(key)).delete();
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    },
  };
}
