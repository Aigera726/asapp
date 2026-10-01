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

/**
 * Заглушки на случай сборки без ключей.
 *
 * createClient падает с «supabaseUrl is required» на пустой строке, причём на
 * импорте модуля — приложение не стартует вовсе, пользователь видит белый
 * экран. В демо-сборке для аналитиков ключей нет намеренно, поэтому
 * подставляем заведомо нерабочий адрес: демо-режим к серверу не обращается, а
 * любой реальный запрос честно провалится сетевой ошибкой.
 */
const PLACEHOLDER_URL = 'http://supabase.invalid';
const PLACEHOLDER_KEY = 'no-key';

let currentUrl = envUrl;
let currentKey = envKey;

export let supabase: SupabaseClient = createClient(
  currentUrl || PLACEHOLDER_URL,
  currentKey || PLACEHOLDER_KEY,
  { auth: authOptions }
);

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
  supabase = createClient(
    nextUrl || PLACEHOLDER_URL,
    nextKey || PLACEHOLDER_KEY,
    { auth: authOptions }
  );

  return supabase;
};

/** Адрес активного проекта — для диагностики и экрана настроек. */
export const getActiveSupabaseUrl = () => currentUrl;

/**
 * Настроен ли сервер.
 *
 * false в демо-сборке для аналитиков: ключей там нет, и клиент работает на
 * заглушке. Экран входа по этому признаку объясняет, что войти нельзя, —
 * иначе форма выглядит рабочей, а любая попытка входа заканчивается сетевой
 * ошибкой без объяснения причины.
 */
export const isServerConfigured = () => currentUrl !== PLACEHOLDER_URL && !!currentUrl;
