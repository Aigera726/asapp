import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Клиент Supabase.
 *
 * Важно держать РОВНО ОДИН экземпляр на одно хранилище: каждый GoTrueClient
 * поднимает свой таймер автообновления токена и берёт блокировку
 * `lock:sb-<ref>-auth-token`. Два клиента с одним storageKey дают ошибку
 * «Lock ... was released because another request stole it» и рвут
 * синхронизацию. Поэтому reinitializeSupabase пересоздаёт клиент только при
 * фактической смене адреса или ключа и гасит автообновление у старого.
 */

const authOptions = {
  storage: AsyncStorage,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
};

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let currentUrl = envUrl;
let currentKey = envKey;

export let supabase: SupabaseClient = createClient(currentUrl, currentKey, {
  auth: authOptions,
});

export const reinitializeSupabase = (url: string | null, key: string | null) => {
  const nextUrl = url || envUrl;
  const nextKey = key || envKey;

  // Тот же адрес и ключ — второй клиент не нужен.
  if (nextUrl === currentUrl && nextKey === currentKey) {
    return supabase;
  }

  // Старый клиент продолжал бы обновлять токен и соперничать за блокировку.
  try {
    supabase.auth.stopAutoRefresh();
  } catch (e) {
    console.warn('[Supabase] Не удалось остановить автообновление токена', e);
  }

  currentUrl = nextUrl;
  currentKey = nextKey;
  supabase = createClient(nextUrl, nextKey, { auth: authOptions });

  return supabase;
};

/** Адрес активного проекта — для диагностики и экрана настроек. */
export const getActiveSupabaseUrl = () => currentUrl;
