import { T } from '@/theme';

/**
 * Справочник предметной области для разделов «Ресурсы» и «Контроль».
 *
 * Коды хранятся в базе, подписи и цвета — только для интерфейса. Держим их в
 * одном месте: раньше подписи статусов дублировались по экранам и расходились
 * (например, ORDERED имел подпись, но не имел цвета).
 */

export type Tone = { bg: string; text: string };

const tone = (bg: string, text: string): Tone => ({ bg, text });

// ── Ресурсы: типы единиц учёта ───────────────────────────────────────────────
export type AssetKind = 'EQUIPMENT' | 'MACHINERY' | 'TOOL';

export const ASSET_KINDS: {
  value: AssetKind;
  label: string;
  plural: string;
  icon: string;
}[] = [
  { value: 'MACHINERY', label: 'Техника', plural: 'Техника', icon: 'excavator' },
  { value: 'EQUIPMENT', label: 'Оборудование', plural: 'Оборудование', icon: 'engine-outline' },
  { value: 'TOOL', label: 'Инструмент', plural: 'Инструменты', icon: 'hammer-wrench' },
];

export const ASSET_KIND_LABELS: Record<string, string> = Object.fromEntries(
  ASSET_KINDS.map((k) => [k.value, k.label])
);

// ── Ресурсы: состояние единицы учёта ────────────────────────────────────────
export const ASSET_STATUS_LABELS: Record<string, string> = {
  IN_USE: 'В работе',
  IDLE: 'Простой',
  REPAIR: 'В ремонте',
  DECOMMISSIONED: 'Списано',
  LOST: 'Утеряно',
};

export const ASSET_STATUS_TONES: Record<string, Tone> = {
  IN_USE: tone(T.colors.successSoft, T.colors.success),
  IDLE: tone(T.colors.neutralSoft, T.colors.textMuted),
  REPAIR: tone(T.colors.warningSoft, T.colors.warning),
  DECOMMISSIONED: tone(T.colors.neutralSoft, T.colors.textMuted),
  LOST: tone(T.colors.dangerSoft, T.colors.danger),
};

export const ASSET_STATUSES = Object.keys(ASSET_STATUS_LABELS);

// ── Ресурсы: движения ───────────────────────────────────────────────────────
export const ASSET_MOVEMENT_LABELS: Record<string, string> = {
  ISSUE: 'Выдача',
  RETURN: 'Возврат',
  TRANSFER: 'Перемещение',
  SERVICE: 'Ремонт / ТО',
  SHIFT: 'Смена (наработка)',
  DECOMMISSION: 'Списание',
};

/** Какое состояние получает единица учёта после движения. */
export const ASSET_MOVEMENT_RESULT_STATUS: Record<string, string> = {
  ISSUE: 'IN_USE',
  RETURN: 'IDLE',
  TRANSFER: 'IN_USE',
  SERVICE: 'REPAIR',
  SHIFT: 'IN_USE',
  DECOMMISSION: 'DECOMMISSIONED',
};

// ── Материалы: движения склада ──────────────────────────────────────────────
export const MATERIAL_MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: 'Приход',
  ISSUE: 'Выдача в работу',
  WRITE_OFF: 'Списание',
  RETURN: 'Возврат на склад',
  TRANSFER: 'Перемещение',
  INVENTORY: 'Инвентаризация',
};

/**
 * Знак движения для расчёта остатка. INVENTORY трактуем как приход
 * корректировки: отрицательную корректировку оформляют списанием.
 */
export const MATERIAL_MOVEMENT_SIGN: Record<string, 1 | -1> = {
  RECEIPT: 1,
  RETURN: 1,
  INVENTORY: 1,
  ISSUE: -1,
  WRITE_OFF: -1,
  TRANSFER: -1,
};

/**
 * Ключ, по которому движения сводятся в одну строку остатка.
 *
 * Группируем по названию, а не по resource_id: приход со склада часто
 * оформляют вручную (без привязки к смете), а списание по нормам приходит уже
 * с resource_id. При группировке по id одна и та же номенклатура распадалась
 * бы на две строки — «приход 15» отдельно от «списание −28».
 */
export function materialBalanceKey(materialName: string): string {
  return materialName.trim().toLowerCase();
}

export const MATERIAL_MOVEMENT_TONES: Record<string, Tone> = {
  RECEIPT: tone(T.colors.successSoft, T.colors.success),
  RETURN: tone(T.colors.successSoft, T.colors.success),
  INVENTORY: tone(T.colors.infoSoft, T.colors.info),
  ISSUE: tone(T.colors.primarySoft, T.colors.primary),
  WRITE_OFF: tone(T.colors.dangerSoft, T.colors.danger),
  TRANSFER: tone(T.colors.warningSoft, T.colors.warning),
};

// ── Технадзор: проверки ─────────────────────────────────────────────────────
export const INSPECTION_KIND_LABELS: Record<string, string> = {
  INCOMING: 'Входной контроль',
  OPERATIONAL: 'Операционный контроль',
  ACCEPTANCE: 'Приёмочный контроль',
  HIDDEN_WORK: 'Скрытые работы',
};

export const INSPECTION_KINDS = Object.keys(INSPECTION_KIND_LABELS);

export const INSPECTION_RESULT_LABELS: Record<string, string> = {
  PASS: 'Соответствует',
  PASS_WITH_REMARKS: 'С замечаниями',
  FAIL: 'Не соответствует',
};

export const INSPECTION_RESULT_TONES: Record<string, Tone> = {
  PASS: tone(T.colors.successSoft, T.colors.success),
  PASS_WITH_REMARKS: tone(T.colors.warningSoft, T.colors.warning),
  FAIL: tone(T.colors.dangerSoft, T.colors.danger),
};

// ── Предписания ─────────────────────────────────────────────────────────────
export const PRESCRIPTION_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Выдано',
  IN_PROGRESS: 'В работе',
  SUBMITTED: 'Предъявлено',
  VERIFIED: 'Проверено',
  REJECTED: 'Не принято',
  CLOSED: 'Закрыто',
};

export const PRESCRIPTION_STATUS_TONES: Record<string, Tone> = {
  OPEN: tone(T.colors.warningSoft, T.colors.warning),
  IN_PROGRESS: tone(T.colors.infoSoft, T.colors.info),
  SUBMITTED: tone(T.colors.primarySoft, T.colors.primary),
  VERIFIED: tone(T.colors.successSoft, T.colors.success),
  REJECTED: tone(T.colors.dangerSoft, T.colors.danger),
  CLOSED: tone(T.colors.neutralSoft, T.colors.textMuted),
};

/** Статусы, при которых предписание считается незакрытым. */
export const PRESCRIPTION_OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REJECTED'];

export const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Низкая',
  MEDIUM: 'Средняя',
  HIGH: 'Высокая',
  CRITICAL: 'Критическая',
};

export const SEVERITY_TONES: Record<string, Tone> = {
  LOW: tone(T.colors.neutralSoft, T.colors.textMuted),
  MEDIUM: tone(T.colors.infoSoft, T.colors.info),
  HIGH: tone(T.colors.warningSoft, T.colors.warning),
  CRITICAL: tone(T.colors.dangerSoft, T.colors.danger),
};

export const SEVERITIES = Object.keys(SEVERITY_LABELS);

// ── Технические отклонения ──────────────────────────────────────────────────
export const DEVIATION_CATEGORY_LABELS: Record<string, string> = {
  DESIGN: 'Проектное решение',
  MATERIAL: 'Замена материала',
  TECHNOLOGY: 'Технология работ',
  GEOMETRY: 'Геометрия / допуски',
  OTHER: 'Прочее',
};

export const DEVIATION_CATEGORIES = Object.keys(DEVIATION_CATEGORY_LABELS);

export const DEVIATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PENDING: 'На согласовании',
  APPROVED: 'Согласовано',
  REJECTED: 'Отклонено',
  IMPLEMENTED: 'Реализовано',
};

export const DEVIATION_STATUS_TONES: Record<string, Tone> = {
  DRAFT: tone(T.colors.neutralSoft, T.colors.textMuted),
  PENDING: tone(T.colors.warningSoft, T.colors.warning),
  APPROVED: tone(T.colors.successSoft, T.colors.success),
  REJECTED: tone(T.colors.dangerSoft, T.colors.danger),
  IMPLEMENTED: tone(T.colors.primarySoft, T.colors.primary),
};

// ── Общее ───────────────────────────────────────────────────────────────────
const NEUTRAL: Tone = { bg: T.colors.neutralSoft, text: T.colors.textMuted };

export function label(dict: Record<string, string>, code: string | null | undefined): string {
  if (!code) return '—';
  return dict[code] ?? code;
}

export function toneOf(dict: Record<string, Tone>, code: string | null | undefined): Tone {
  if (!code) return NEUTRAL;
  return dict[code] ?? NEUTRAL;
}

/** Просрочено ли предписание: срок прошёл, а работа не принята. */
export function isOverdue(dueAt: Date | null, status: string): boolean {
  if (!dueAt) return false;
  if (!PRESCRIPTION_OPEN_STATUSES.includes(status)) return false;
  return dueAt.getTime() < Date.now();
}

/** Количество без хвоста из нулей: 12 вместо 12.000, но 12.5 сохраняется. */
export function formatQty(v: number): string {
  const rounded = Math.round(v * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(3).replace(/0+$/, '');
}
