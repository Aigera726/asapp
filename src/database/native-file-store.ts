import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

/** Keep large snapshots out of Android AsyncStorage's size limit; only the atomic pointer goes there. */
export function nativeSnapshotStorage() {
  const folder = new Directory(Paths.document, 'mobile-database');
  const file = (key: string) => new File(folder, encodeURIComponent(key));
  return {
    async getItem(key: string): Promise<string | null> {
      if (key.endsWith(':manifest')) return AsyncStorage.getItem(key);
      const f = file(key);
      return f.exists ? f.text() : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      if (key.endsWith(':manifest')) { await AsyncStorage.setItem(key, value); return; }
      folder.create({ idempotent: true, intermediates: true });
      file(key).write(value);
    },
    async removeItem(key: string): Promise<void> {
      if (key.endsWith(':manifest')) { await AsyncStorage.removeItem(key); return; }
      const f = file(key);
      if (f.exists) f.delete();
    },
  };
}
