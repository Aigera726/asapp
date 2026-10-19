import { translate, type Language, type TranslationKey } from './messages';

export const LOCALES: Record<Language, string> = { ru: 'ru-RU', en: 'en-GB', ka: 'ka-GE', az: 'az-AZ' };
export const WORK_STATUS: Record<string, TranslationKey> = {
  PLANNED: 'work.planned', IN_PROGRESS: 'work.inProgress', COMPLETED: 'work.completed', SUSPENDED: 'work.suspended',
};
export const REPORT_STATUS: Record<string, TranslationKey> = {
  pending_approval: 'history.pending', approved: 'history.approved', rejected: 'history.rejected',
  matching_error: 'history.matchError', local: 'history.local',
};
const UNIT_KEYS: Record<string, TranslationKey> = {
  'ед.': 'units.generic', 'ед': 'units.generic', units: 'units.generic',
  'м': 'units.m', m: 'units.m', M: 'units.m', METER: 'units.m', 'метр': 'units.m',
  'м²': 'units.m2', 'м2': 'units.m2', 'm²': 'units.m2', m2: 'units.m2', M2: 'units.m2', 'квадратный метр': 'units.m2',
  'м³': 'units.m3', 'м3': 'units.m3', 'm³': 'units.m3', m3: 'units.m3', M3: 'units.m3', 'кубический метр': 'units.m3',
  'кг': 'units.kg', kg: 'units.kg', KG: 'units.kg', 'килограмм': 'units.kg',
  'т': 'units.t', t: 'units.t', TON: 'units.t', 'тонна': 'units.t',
  'л': 'units.l', l: 'units.l', L: 'units.l', 'литр': 'units.l',
  'ч': 'units.hour', 'час': 'units.hour', h: 'units.hour', HOUR: 'units.hour',
  'чел.-ч': 'units.manHour', 'чел-ч': 'units.manHour', MAN_HOUR: 'units.manHour', 'человеко-час': 'units.manHour',
  'шт.': 'units.pcs', 'шт': 'units.pcs', pcs: 'units.pcs', PIECE: 'units.pcs', 'штука': 'units.pcs',
};
export function unitLabel(value: string | null | undefined, language: Language): string {
  if (!value) return translate(language, 'units.generic');
  const key = UNIT_KEYS[value.trim()] || UNIT_KEYS[value.trim().toLowerCase()];
  return key ? translate(language, key) : value;
}
export function displayQty(value: number, language: Language): string {
  return new Intl.NumberFormat(LOCALES[language], { maximumFractionDigits: 3 }).format(value);
}
export function displayDate(value: Date | null, language: Language, timeOnly = false): string {
  if (!value || Number.isNaN(value.getTime())) return '—';
  return value.toLocaleString(LOCALES[language], timeOnly ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function reportError(message: string | null | undefined, language: Language): string {
  if (/нет доступной работы|задание недоступно/i.test(message || '')) return translate(language, 'report.unavailable');
  if (/обновите данные на главном экране/i.test(message || '')) return translate(language, 'report.reloadEstimate');
  return message || translate(language, 'report.saveError');
}

// Only our bundled demo fixtures have fixed sample names. Live names always come from catalogue localizations.
const DEMO_NAMES: Record<string, TranslationKey> = {
  'Устройство монолитной плиты перекрытия (демо)': 'demo.slab',
  'Бетон B25 W6 F150': 'demo.concrete', 'Арматура A500C ⌀12': 'demo.rebar',
  'Фанера ламинированная 18 мм': 'demo.plywood',
};
export function demoName(value: string, language: Language): string {
  return DEMO_NAMES[value] ? translate(language, DEMO_NAMES[value]) : value;
}
