import { T } from '@/theme';

/**
 * Человекопонятные названия статусов закупок и складских операций.
 * Используется во всех экранах модулей «Закупки» и «Приёмка».
 */

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PENDING: 'Ожидает',
  PENDING_APPROVAL: 'Ожидает согласования',
  APPROVED: 'Согласована',
  REJECTED: 'Отклонена',
  ORDERED: 'Заказано',
  IN_TRANSIT: 'В пути',
  PARTIALLY_RECEIVED: 'Частично получена',
  RECEIVED: 'Получена',
  DELIVERED: 'Доставлена',
  CANCELLED: 'Отменена',
};

/**
 * Цвет статуса. Ключи держим в синхроне с STATUS_LABELS — раньше ORDERED
 * имел подпись, но не имел цвета и рисовался нейтрально-серым, из-за чего
 * «заказано» визуально не отличалось от «отменено».
 */
export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: T.colors.neutralSoft, text: T.colors.textSecondary },
  PENDING: { bg: T.colors.warningSoft, text: T.colors.warning },
  PENDING_APPROVAL: { bg: T.colors.warningSoft, text: T.colors.warning },
  APPROVED: { bg: T.colors.successSoft, text: T.colors.success },
  REJECTED: { bg: T.colors.dangerSoft, text: T.colors.danger },
  ORDERED: { bg: T.colors.primarySoft, text: T.colors.primaryText },
  IN_TRANSIT: { bg: T.colors.infoSoft, text: T.colors.info },
  PARTIALLY_RECEIVED: { bg: T.colors.accentSoft, text: T.colors.accent },
  RECEIVED: { bg: T.colors.successSoft, text: T.colors.success },
  DELIVERED: { bg: T.colors.successSoft, text: T.colors.success },
  CANCELLED: { bg: T.colors.neutralSoft, text: T.colors.textMuted },
};

/** Статусы заказа, при которых приёмка ещё не завершена. */
export const OPEN_ORDER_STATUSES = [
  'DRAFT',
  'PENDING',
  'PENDING_APPROVAL',
  'APPROVED',
  'ORDERED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
];

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusColor(status: string): { bg: string; text: string } {
  return STATUS_COLORS[status] || { bg: T.colors.neutralSoft, text: T.colors.textMuted };
}

/**
 * Отформатированная денежная сумма. Пустое значение даёт прочерк, а не «NaN».
 *
 * Валюта вынесена в константу: остальная доменная модель (БИН/ИИН, ТОО)
 * пока казахстанская, поэтому символ не меняем вместе с ребрендингом —
 * это отдельное продуктовое решение.
 */
const CURRENCY_SYMBOL = '₸';

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toLocaleString('ru-RU')} ${CURRENCY_SYMBOL}`;
}
