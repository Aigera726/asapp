/**
 * «Умное» форматирование даты — «сегодня 14:30», «вчера», «21 мая».
 */
export function formatSmartDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - dayMs);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return `сегодня ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (isYesterday) {
    return `вчера ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diff < 7 * dayMs) {
    return date.toLocaleDateString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
