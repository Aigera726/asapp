import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { NativeModules } from 'react-native';
import { schema } from './schema';
import { migrations } from './migrations';
import { modelClasses } from './models';

// Нативный модуль WatermelonDB присутствует только в dev-client/релизной
// сборке; в обычном Expo Go его нет, поэтому там откатываемся на LokiJS.
const isNativeAvailable = NativeModules.WatermelonDB != null;

let adapter;

if (isNativeAvailable) {
  adapter = new SQLiteAdapter({
    schema,
    migrations,
    jsi: true, // JSI для производительности на устройстве
    onSetUpError: (err: Error) => {
      console.error('[WatermelonDB] SQLite setup error:', err);
    },
  });
} else {
  console.warn('[WatermelonDB] Native module not found. Falling back to LokiJS (Expo Go compatibility mode).');
  adapter = new LokiJSAdapter({
    schema,
    migrations,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    onSetUpError: (err: Error) => {
      console.error('[WatermelonDB] LokiJS setup error:', err);
    },
  });
}

export const database = new Database({
  adapter,
  modelClasses,
});
