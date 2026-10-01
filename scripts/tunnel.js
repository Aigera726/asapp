#!/usr/bin/env node
/**
 * Публичный туннель к локальному порту через ngrok.
 *
 * Нужен там, где порт наружу не открыть: Windows Firewall блокирует входящие
 * по умолчанию, а правило добавляется только с правами администратора.
 * Туннель работает исходящим соединением, поэтому прав не требует.
 *
 * ВНИМАНИЕ: трафик идёт через сторонний сервис ngrok. Пускать сюда стоит
 * только то, что не жаль показать — например демо-сборку без ключей
 * (см. scripts/export-demo.js).
 *
 *   node scripts/tunnel.js [порт]
 */
const ngrok = require('@expo/ngrok');

const port = Number(process.argv[2] || 80);

(async () => {
  try {
    const url = await ngrok.connect({ addr: port, proto: 'http' });
    console.log('=== ТУННЕЛЬ ПОДНЯТ ===');
    console.log('Публичный адрес: ' + url);
    console.log('Ведёт на localhost:' + port);
    console.log('Работает, пока это окно открыто. Ctrl+C — закрыть.');
  } catch (e) {
    console.error('=== НЕ УДАЛОСЬ ===');
    console.error(e && e.message ? e.message : String(e));
    // У ngrok полезности обычно в body, а не в message.
    if (e && e.body) console.error(JSON.stringify(e.body).slice(0, 1000));
    if (e && e.details) console.error(JSON.stringify(e.details).slice(0, 1000));
    process.exit(1);
  }
})();
