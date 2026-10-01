#!/usr/bin/env node
/**
 * Сборка веб-версии, РАБОТАЮЩЕЙ С СЕРВЕРОМ (вход и регистрация).
 *
 * Отличие от export-demo.js: здесь .env читается, и в бандл попадают адреса
 * Supabase и бэкенда УСП вместе с anon-ключом.
 *
 * Что это значит, если сборку выложить публично:
 *
 *  * anon-ключ по замыслу Supabase публичен — он и так лежит в каждом
 *    мобильном билде, данные защищает RLS, а не секретность ключа;
 *  * но любой, кто найдёт адрес страницы, сможет ЗАРЕГИСТРИРОВАТЬСЯ в вашей
 *    боевой системе: аккаунт в auth.users и заявка на привязку появятся
 *    по-настоящему, и подтверждать или отклонять их придётся вам.
 *
 * Для показа интерфейса аналитикам это не нужно — им хватает демо-режима
 * (npm run export:demo). Этот вариант — когда нужен реальный вход.
 *
 *   node scripts/export-public.js [адрес бэкенда]
 *
 * Аргумент переопределяет EXPO_PUBLIC_API_URL. Нужен, когда регистрация идёт
 * не напрямую в бэкенд, а через прокси раздачи (см. --api в serve-static.js):
 * тогда сюда передают адрес самой раздачи.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const apiOverride = process.argv[2];

const env = {
  ...process.env,
  // Кнопка «Демо-режим» остаётся: она не мешает реальному входу и позволяет
  // показать интерфейс, не заводя учётную запись.
  EXPO_PUBLIC_ENABLE_DEMO: '1',
  ...(apiOverride ? { EXPO_PUBLIC_API_URL: apiOverride } : {}),
};

if (apiOverride) console.log('Адрес бэкенда для регистрации: ' + apiOverride);

const cli = path.join('node_modules', 'expo', 'bin', 'cli');
const res = spawnSync(
  process.execPath,
  [cli, 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'],
  { env, stdio: 'inherit' }
);

if (res.status !== 0) process.exit(res.status ?? 1);

console.log('\n=== В dist лежит СБОРКА С СЕРВЕРОМ ===');
console.log('Вход и регистрация работают против боевой базы.');
console.log('Вернуться к демо без сервера: npm run export:demo');
