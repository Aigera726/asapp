/**
 * Адрес бэкенда УСП (регистрация мобильных пользователей).
 *
 * Держится отдельно от process.env по той же причине, что и адрес Supabase
 * (см. lib/supabase.ts): сервер можно переключить в приложении, а зашитый в
 * сборку EXPO_PUBLIC_API_URL оставался бы прежним. Пользователь создавался бы
 * на старом хосте, а signInWithPassword уходил на новый и падал с «Invalid
 * login credentials» — при том что аккаунт уже занят и повторная регистрация
 * тоже не пройдёт.
 */

/** Убираем хвостовые слэши, чтобы склейка с путём не давала «//api». */
const normalize = (url: string) => url.trim().replace(/\/+$/, '');

const envApiUrl = normalize(process.env.EXPO_PUBLIC_API_URL ?? '');

let currentApiUrl = envApiUrl;

/** null или пустая строка — вернуться к адресу из сборки. */
export const setApiUrl = (url: string | null): string => {
  currentApiUrl = url ? normalize(url) : envApiUrl;
  return currentApiUrl;
};

/** Активный адрес — для экрана настроек и диагностики. */
export const getApiUrl = (): string => currentApiUrl;

/**
 * Абсолютный адрес метода бэкенда, либо null, если адрес не настроен.
 *
 * Раньше URL собирался шаблоном прямо из process.env, и при отсутствующей
 * переменной fetch уходил на «undefined/api/auth/register-mobile» —
 * пользователь видел сетевую ошибку вместо причины.
 */
export const apiEndpoint = (path: string): string | null => {
  if (!currentApiUrl) return null;
  return `${currentApiUrl}/${path.replace(/^\/+/, '')}`;
};
