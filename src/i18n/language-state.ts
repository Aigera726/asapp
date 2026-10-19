import type { StateCreator } from 'zustand';
import { isLanguage, type Language } from './messages';

export const LANGUAGE_STORAGE_KEY = 'ASAPP_LANGUAGE_V1';
type LanguageStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
export interface LanguageState {
  language: Language;
  isLoaded: boolean;
  storageError: boolean;
  loadLanguage(): Promise<void>;
  setLanguage(language: Language): Promise<void>;
}

export function createLanguageState(storage: LanguageStorage): StateCreator<LanguageState> {
  let load: Promise<void> | undefined;
  let version = 0;
  let writes = Promise.resolve();
  return (set, get) => ({
    language: 'ru', isLoaded: false, storageError: false,
    loadLanguage() {
      if (get().isLoaded) return Promise.resolve();
      if (load) return load;
      const startedAt = version;
      load = storage.getItem(LANGUAGE_STORAGE_KEY).then(value => {
        if (version === startedAt && isLanguage(value)) set({ language: value });
      }).catch(() => set({ storageError: true })).finally(() => set({ isLoaded: true }));
      return load;
    },
    setLanguage(language) {
      if (!isLanguage(language)) return Promise.resolve();
      const selectedAt = ++version;
      set({ language });
      // Serialize writes: a slow previous selection must not overwrite the latest choice.
      writes = writes.then(() => storage.setItem(LANGUAGE_STORAGE_KEY, language)).then(() => {
        if (version === selectedAt) set({ storageError: false });
      }).catch(() => { if (version === selectedAt) set({ storageError: true }); });
      return writes;
    },
  });
}
