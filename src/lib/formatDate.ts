import { translate, type Language } from '@/i18n/messages';
import { LOCALES } from '@/i18n/work';

/** Relative dates only change display, not the stored timestamp. */
export function formatSmartDate(date: Date, language: Language = 'ru'): string {
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return translate(language, 'dates.today', { time: date.toLocaleTimeString(LOCALES[language], { hour: '2-digit', minute: '2-digit' }) });
  }
  if (isYesterday) {
    return translate(language, 'dates.yesterday', { time: date.toLocaleTimeString(LOCALES[language], { hour: '2-digit', minute: '2-digit' }) });
  }
  if (diff < 7 * dayMs) {
    return date.toLocaleDateString(LOCALES[language], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(LOCALES[language], { day: 'numeric', month: 'short' });
}
