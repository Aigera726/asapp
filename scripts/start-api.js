#!/usr/bin/env node
/**
 * Второй экземпляр бэкенда УСП — с исправленной регистрацией.
 *
 * Зачем не перезапустить основной. Процесс на :9000 принадлежит другому
 * пользователю Windows, остановить его нельзя без прав администратора
 * (Stop-Process и taskkill отвечают «Access is denied»). Поэтому поднимаем
 * рядом второй экземпляр того же кода на своём порту: старый продолжает
 * обслуживать веб-ERP, а мобильная регистрация идёт в новый — с созданием
 * профиля в одной операции с аккаунтом и откатом при сбое.
 *
 * Слушает только локально по смыслу: наружу его отдаёт прокси раздачи
 * (scripts/serve-static.js --api=...), потому что новый порт в firewall всё
 * равно не открыть.
 *
 * PORT задаётся здесь: dotenv не перезаписывает уже заданные переменные,
 * поэтому PORT=9000 из .env не помешает.
 */
const { spawn } = require('child_process');
const path = require('path');

const SERVER_DIR = process.env.ERP_SERVER_DIR || 'C:/ERP_DEMO/server';
const PORT = process.argv[2] || '9100';

console.log(`Запускаю бэкенд из ${SERVER_DIR} на порту ${PORT}`);

const child = spawn(process.execPath, ['index.js'], {
  cwd: SERVER_DIR,
  env: { ...process.env, PORT },
  stdio: 'inherit',
});

child.on('error', (e) => {
  console.error('Не удалось запустить: ' + e.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
