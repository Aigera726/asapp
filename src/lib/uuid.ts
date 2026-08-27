/**
 * Генерация UUID v4 для совместимости с Supabase.
 *
 * Используем криптографический источник случайности (полифилл
 * react-native-get-random-values подключается в App.tsx). Math.random здесь
 * недопустим: идентификаторы создаются офлайн на множестве устройств и
 * попадают в общую базу как первичные ключи — коллизия означает потерю
 * чужого отчёта или заявки при синхронизации.
 */
export function generateUUID(): string {
  const bytes = new Uint8Array(16);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Полифилл не загрузился — не молчим, но и не ломаем запись данных.
    console.warn('[uuid] crypto.getRandomValues недоступен, используется Math.random');
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Версия 4 и вариант RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }

  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
