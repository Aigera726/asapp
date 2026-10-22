import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { NativeModules } from 'react-native';
import { persistentLokiStorage, durableLokiWrites } from './durable-loki';
import { nativeSnapshotStorage } from './native-file-store';
import { schema } from './schema';
import { migrations } from './migrations';
import { modelClasses } from './models';

// Expo Go has no Watermelon native bridge or IndexedDB. Persist its Loki database
// in document files with an atomic AsyncStorage pointer, and await every write.
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
  const extraLokiOptions = { adapter: persistentLokiStorage(nativeSnapshotStorage()), autosave: false };
  adapter = durableLokiWrites(new LokiJSAdapter({
    schema,
    migrations,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    extraLokiOptions,
    onSetUpError: (err: Error) => {
      console.error('[WatermelonDB] LokiJS setup error:', err);
    },
  }));
}

export const database = new Database({
  adapter,
  modelClasses,
});
