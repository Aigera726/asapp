import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, reinitializeSupabase } from '@/lib/supabase';

interface ConfigState {
  supabaseUrl: string | null;
  supabaseKey: string | null;
  serverName: string | null;
  isLoaded: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (url: string, key: string, name?: string) => Promise<void>;
  resetConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  supabaseUrl: null,
  supabaseKey: null,
  serverName: null,
  isLoaded: false,

  loadConfig: async () => {
    try {
      const url = await AsyncStorage.getItem('CUSTOM_SUPABASE_URL');
      const key = await AsyncStorage.getItem('CUSTOM_SUPABASE_KEY');
      const name = await AsyncStorage.getItem('CUSTOM_SERVER_NAME');
      if (url && key) {
        set({ supabaseUrl: url, supabaseKey: key, serverName: name || 'Локальный сервер', isLoaded: true });
        reinitializeSupabase(url, key);
      } else {
        set({ serverName: 'По умолчанию', isLoaded: true });
        // Falls back to .env inside reinitializeSupabase if passed nulls, but we'll handle it there
      }
    } catch (e) {
      console.error('Failed to load config', e);
      set({ isLoaded: true });
    }
  },

  saveConfig: async (url: string, key: string, name?: string) => {
    try {
      await AsyncStorage.setItem('CUSTOM_SUPABASE_URL', url);
      await AsyncStorage.setItem('CUSTOM_SUPABASE_KEY', key);
      if (name) {
        await AsyncStorage.setItem('CUSTOM_SERVER_NAME', name);
      } else {
        await AsyncStorage.removeItem('CUSTOM_SERVER_NAME');
      }
      set({ supabaseUrl: url, supabaseKey: key, serverName: name || 'Локальный сервер' });
      reinitializeSupabase(url, key);
    } catch (e) {
      console.error('Failed to save config', e);
    }
  },

  resetConfig: async () => {
    try {
      await AsyncStorage.removeItem('CUSTOM_SUPABASE_URL');
      await AsyncStorage.removeItem('CUSTOM_SUPABASE_KEY');
      await AsyncStorage.removeItem('CUSTOM_SERVER_NAME');
      set({ supabaseUrl: null, supabaseKey: null, serverName: 'По умолчанию' });
      reinitializeSupabase(null, null); // Will fallback to .env
    } catch (e) {
      console.error('Failed to reset config', e);
    }
  }
}));
