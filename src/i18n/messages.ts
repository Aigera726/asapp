import ru from '../lang/ru.json';
import en from '../lang/en.json';
import ka from '../lang/ka.json';
import az from '../lang/az.json';

export type Language = 'ru' | 'en' | 'ka' | 'az';
export type TranslationKey = keyof typeof ru;
export type TranslationParams = Record<string, string | number>;
export const dictionaries: Record<Language, Record<TranslationKey, string>> = { ru, en, ka, az };
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'ka', label: 'ქართული' },
  { code: 'az', label: 'Azərbaycanca' },
];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LANGUAGES.some(item => item.code === value);
}

export function translate(language: Language, key: TranslationKey, params: TranslationParams = {}): string {
  return (dictionaries[language]?.[key] || ru[key]).replace(/\{(\w+)\}/g,
    (placeholder, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder);
}

/** Translate known service messages; never translate names, IDs or user input. */
export function authError(message: string | null | undefined, language: Language): string {
  const rules: [RegExp, TranslationKey][] = [
    [/invalid login credentials|invalid credentials|неверн.*(парол|email)/i, 'errors.credentials'],
    [/already registered|already exists|уже.*(существует|зарегистрирован)|email.*занят/i, 'errors.emailExists'],
    [/email not confirmed/i, 'errors.emailUnconfirmed'],
    [/too many|rate limit|over_request_rate_limit/i, 'errors.rateLimit'],
    [/failed to fetch|network request failed|fetch failed|timeout|недоступен|connection refused/i, 'errors.network'],
    [/адрес сервера регистрации не задан/i, 'errors.registrationServer'],
    [/неожиданный ответ/i, 'errors.unexpectedResponse'],
    [/ошибка создания пользователя/i, 'errors.createUser'],
    [/ID контрагента должен быть UUID/i, 'errors.contractorId'],
    [/не авторизован|not authenticated/i, 'errors.notAuthorized'],
  ];
  const match = rules.find(([pattern]) => pattern.test(message || ''));
  // Keep an unrecognized service reason visible instead of disguising it as a network error.
  return match ? translate(language, match[1]) : message || translate(language, 'errors.generic');
}
