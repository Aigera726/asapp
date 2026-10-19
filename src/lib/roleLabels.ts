import type { UserRole } from '@/store/authStore';
import { translate, type Language, type TranslationKey } from '@/i18n/messages';

/** Подписи ролей: в базе лежат коды enum public.user_role. */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  ORG_ADMIN: 'Администратор организации',
  PTO: 'ПТО',
  TECH_SUPERVISOR: 'Технадзор',
  CONTRACTOR: 'Подрядчик',
  STOREKEEPER: 'Кладовщик',
};

export function getRoleLabel(role: UserRole | string | null, language: Language = 'ru'): string {
  if (!role) return '—';
  return Object.prototype.hasOwnProperty.call(ROLE_LABELS, role) ? translate(language, `roles.${role}` as TranslationKey) : role;
}

/**
 * Что показать под названием приложения.
 *
 * У ADMIN и PTO нет привязки к организации (contractor_id = null), поэтому
 * подпись «Загрузка...» висела там вечно. Показываем организацию, если она
 * есть, иначе роль, и только при полностью пустом профиле — «Загрузка...».
 */
export function getAccountSubtitle(
  contractorName: string | null,
  role: UserRole | string | null,
  language: Language = 'ru'
): string {
  if (contractorName) return contractorName;
  if (role) return getRoleLabel(role, language);
  return translate(language, 'common.loading');
}
