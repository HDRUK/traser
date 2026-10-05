export interface StoredObject {
  key: string;
  size: number;
  updatedAtMs: number;
}

export interface StorageDriver {
  readonly describe: string;
  readJson<T>(key: string): Promise<T | null>;
  writeJson(key: string, value: unknown): Promise<void>;
  list(prefix: string): Promise<StoredObject[]>;
  remove(key: string): Promise<void>;
}
