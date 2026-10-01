#!/usr/bin/env node
/**
 * Сборка демо-версии для веба (для показа бизнес-аналитикам).
 *
 * Отдельным скриптом, а не строкой в package.json, по двум причинам:
 *
 *  1. EXPO_NO_DOTENV=1 здесь критичен. Без него Expo подхватит .env и
 *     запечёт в бандл адрес боевого Supabase вместе с anon-ключом — сборка,
 *     которую потом выкладывают публично. Забыть эту переменную в командной
 *     строке слишком легко.
 *  2. Префикс `VAR=1 команда` не работает в cmd.exe и PowerShell, поэтому
 *     кросс-платформенный npm-скрипт одной строкой не написать.
 *
 * Демо-режим работает целиком локально (WatermelonDB в браузере), поэтому
 * ключи серверу этой сборке не нужны вовсе — см. lib/supabase.ts и
 * lib/demoBuild.ts.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  // Не читать .env — иначе боевые ключи попадут в публичный бандл.
  EXPO_NO_DOTENV: '1',
  // Показать кнопку «Демо-режим» в production-сборке.
  EXPO_PUBLIC_ENABLE_DEMO: '1',
  // Пусто намеренно: сервер этой сборке недоступен.
  EXPO_PUBLIC_SUPABASE_URL: '',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
  EXPO_PUBLIC_API_URL: '',
  EXPO_PUBLIC_SIGN_SERVICE_URL: '',
};

const cli = path.join('node_modules', 'expo', 'bin', 'cli');
const res = spawnSync(
  process.execPath,
  [cli, 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'],
  { env, stdio: 'inherit' }
);

if (res.status !== 0) process.exit(res.status ?? 1);

console.log('\nГотово. Поднять раздачу:');
console.log('  node scripts/serve-static.js 8090 dist');
