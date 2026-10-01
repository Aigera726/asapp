import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { NativeModules } from 'react-native';
import { schema } from './schema';
import { migrations } from './migrations';
import { modelClasses } from './models';

// Нативный модуль WatermelonDB присутствует только в dev-client/релизной
// сборке; в обычном Expo Go его нет, поэтому там откатываемся на LokiJS.
// Модуль регистрируется в нативном коде под именем WMDatabaseBridge
// (см. native/android/.../WMDatabaseBridge.java), а не "WatermelonDB" —
// с неверным именем эта проверка всегда была false, и приложение молча
// уходило на LokiJS даже в релизной сборке, где LokiJS полагается на
// IndexedDB, недоступный в React Native, и падает при инициализации.
const isNativeAvailable = NativeModules.WMDatabaseBridge != null;

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
