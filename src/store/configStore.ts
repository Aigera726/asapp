import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, reinitializeSupabase } from '@/lib/supabase';
import { setApiUrl } from '@/lib/api';

interface ConfigState {
  supabaseUrl: string | null;
  supabaseKey: string | null;
  /**
   * Адрес бэкенда УСП для регистрации.
   *
   * Хранится вместе с адресом Supabase, потому что это один и тот же сервер:
   * переключив только Supabase, пользователь регистрировался бы на старом
   * хосте, а входил на новом — и не мог войти вовсе (см. lib/api.ts).
   * Пусто — берётся адрес из сборки.
   */
  apiUrl: string | null;
  serverName: string | null;
  isLoaded: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (url: string, key: string, name?: string, apiUrl?: string) => Promise<void>;
  resetConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  supabaseUrl: null,
  supabaseKey: null,
  apiUrl: null,
  serverName: null,
  isLoaded: false,

  loadConfig: async () => {
    try {
      const url = await AsyncStorage.getItem('CUSTOM_SUPABASE_URL');
      const key = await AsyncStorage.getItem('CUSTOM_SUPABASE_KEY');
      const name = await AsyncStorage.getItem('CUSTOM_SERVER_NAME');
      const api = await AsyncStorage.getItem('CUSTOM_API_URL');
      // Адрес бэкенда применяем независимо от Supabase: он мог быть задан и
      // без своей пары url+key, а setApiUrl(null) сам вернётся к сборке.
      setApiUrl(api);
      if (url && key) {
        set({ supabaseUrl: url, supabaseKey: key, apiUrl: api, serverName: name || 'Локальный сервер', isLoaded: true });
        reinitializeSupabase(url, key);
      } else {
        set({ apiUrl: api, serverName: 'По умолчанию', isLoaded: true });
        // Falls back to .env inside reinitializeSupabase if passed nulls, but we'll handle it there
      }
    } catch (e) {
      console.error('Failed to load config', e);
      set({ isLoaded: true });
    }
  },

  saveConfig: async (url: string, key: string, name?: string, apiUrl?: string) => {
    try {
      await AsyncStorage.setItem('CUSTOM_SUPABASE_URL', url);
      await AsyncStorage.setItem('CUSTOM_SUPABASE_KEY', key);
      if (name) {
        await AsyncStorage.setItem('CUSTOM_SERVER_NAME', name);
      } else {
        await AsyncStorage.removeItem('CUSTOM_SERVER_NAME');
      }
      const api = apiUrl?.trim() || null;
      if (api) {
        await AsyncStorage.setItem('CUSTOM_API_URL', api);
      } else {
        await AsyncStorage.removeItem('CUSTOM_API_URL');
      }
      set({ supabaseUrl: url, supabaseKey: key, apiUrl: api, serverName: name || 'Локальный сервер' });
      reinitializeSupabase(url, key);
      setApiUrl(api);
    } catch (e) {
      console.error('Failed to save config', e);
    }
  },

  resetConfig: async () => {
    try {
      await AsyncStorage.removeItem('CUSTOM_SUPABASE_URL');
      await AsyncStorage.removeItem('CUSTOM_SUPABASE_KEY');
      await AsyncStorage.removeItem('CUSTOM_SERVER_NAME');
      await AsyncStorage.removeItem('CUSTOM_API_URL');
      set({ supabaseUrl: null, supabaseKey: null, apiUrl: null, serverName: 'По умолчанию' });
      reinitializeSupabase(null, null); // Will fallback to .env
      setApiUrl(null);
    } catch (e) {
      console.error('Failed to reset config', e);
    }
  }
}));
