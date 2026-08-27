import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { schema } from './schema';
import { migrations } from './migrations';
import { modelClasses } from './models';

// Web-сборка: SQLite недоступен, работаем на LokiJS + IndexedDB.
const adapter = new LokiJSAdapter({
  schema,
  migrations,
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  onQuotaExceededError: (err: Error) => {
    console.warn('[WatermelonDB] Quota exceeded:', err);
  },
  onSetUpError: (err: Error) => {
    console.error('[WatermelonDB] Setup error:', err);
  },
});

export const database = new Database({
  adapter,
  modelClasses,
});
