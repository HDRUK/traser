export interface LeaseState {
  owner: string;
  generation: number;
  startedAt: string;
  progress?: { completed: number; total: number };
}

export interface CoordinationStore {
  readonly describe: string;
  acquire(name: string, owner: string, ttlMs: number): Promise<LeaseState | null>;
  renew(name: string, lease: LeaseState, ttlMs: number): Promise<boolean>;
  read(name: string): Promise<LeaseState | null>;
  release(name: string, owner?: string): Promise<boolean>;
  bumpCounter(name: string): Promise<number>;
  readCounter(name: string): Promise<number>;
}
