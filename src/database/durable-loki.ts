import type { DatabaseAdapter } from '@nozbe/watermelondb/adapters/type';

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type Manifest = { version: 1; generation: string; chunks: number };
const CHUNK_SIZE = 180000;

/** Commit the manifest last: interruption during a save leaves the previous complete snapshot. */
export function persistentLokiStorage(storage: Storage, prefix = 'mobile:loki:v1:') {
  let writes: Promise<unknown> = Promise.resolve(), sequence = 0;
  const manifestKey = (name: string) => prefix + name + ':manifest';
  const chunkKey = (name: string, generation: string, index: number) => `${prefix}${name}:${generation}:${index}`;
  function manifest(value: string): Manifest {
    const m = JSON.parse(value);
    if (m.version !== 1 || typeof m.generation !== 'string' || !Number.isSafeInteger(m.chunks) || m.chunks < 1) {
      throw new Error('mobile_storage_corrupt');
    }
    return m;
  }
  const cleanup = async (name: string, m: Manifest) => {
    for (let i = 0; i < m.chunks; i++) await storage.removeItem(chunkKey(name, m.generation, i));
  };
  return {
    loadDatabase(name: string, callback: (value: string | Error | null) => void) {
      writes.then(async () => {
        const value = await storage.getItem(manifestKey(name));
        if (value == null) return null;
        const m = manifest(value), parts: string[] = [];
        for (let i = 0; i < m.chunks; i++) {
          const part = await storage.getItem(chunkKey(name, m.generation, i));
          if (part == null) throw new Error('mobile_storage_corrupt');
          parts.push(part);
        }
        return parts.join('');
      }).then(callback, error => callback(error instanceof Error ? error : new Error('mobile_storage_failed')));
    },
    saveDatabase(name: string, value: string, callback: (error?: Error | null) => void) {
      const save = writes.catch(() => {}).then(async () => {
        const oldValue = await storage.getItem(manifestKey(name));
        const parts: string[] = [];
        for (let start = 0; start < value.length;) {
          let end = Math.min(start + CHUNK_SIZE, value.length);
          const last = value.charCodeAt(end - 1);
          if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
          parts.push(value.slice(start, end));
          start = end;
        }
        if (!parts.length) parts.push('');
        const next: Manifest = { version: 1, generation: `${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`, chunks: parts.length };
        for (let i = 0; i < next.chunks; i++) await storage.setItem(chunkKey(name, next.generation, i), parts[i]);
        await storage.setItem(manifestKey(name), JSON.stringify(next));
        // Cleanup cannot turn a committed save into a reported failure.
        if (oldValue) try { await cleanup(name, manifest(oldValue)); } catch { /* safe to keep old chunks */ }
      });
      writes = save;
      save.then(() => callback(null), error => callback(error instanceof Error ? error : new Error('mobile_storage_failed')));
    },
    deleteDatabase(name: string, callback: (error?: Error | null) => void) {
      const remove = writes.catch(() => {}).then(async () => {
        const value = await storage.getItem(manifestKey(name));
        await storage.removeItem(manifestKey(name));
        if (value) await cleanup(name, manifest(value));
      });
      writes = remove;
      remove.then(() => callback(), callback);
    },
  };
}

/** Watermelon must not acknowledge a write until Loki's persistent snapshot is committed. */
export function durableLokiWrites<T extends DatabaseAdapter>(adapter: T): T {
  const execute = adapter.unsafeExecute.bind(adapter);
  const flush = () => new Promise<void>((resolve, reject) => {
    execute({ loki: loki => { loki.saveDatabase((error: Error | null) => error ? reject(error) : resolve()); } }, result => {
      if ('error' in result) reject(result.error);
    });
  });
  for (const key of ['batch', 'setLocal', 'removeLocal', 'destroyDeletedRecords', 'unsafeResetDatabase'] as const) {
    const original = adapter[key].bind(adapter) as (...args: any[]) => void;
    (adapter as any)[key] = (...args: any[]) => {
      const callback = args.pop();
      original(...args, (result: { error?: Error; value?: unknown }) => {
        if (result.error) { callback(result); return; }
        flush().then(() => callback(result), error => callback({ error: new Error('mobile_storage_failed', { cause: error }) }));
      });
    };
  }
  return adapter;
}
