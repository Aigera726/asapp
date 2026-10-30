import { supabase } from '@/lib/supabase';

/**
 * Остаток материалов работы с сервера (sql/usp/17_material_usage.sql):
 * количество по фактической смете и уже списанное подтверждёнными фактами и
 * фактами на подтверждении. Ключ — строка фактической сметы (estimate_resources.id).
 *
 * null — нет связи или представление ещё не создано: форма ограничивает
 * количество сметой на всю работу, окончательную проверку делает УСП.
 */
export type MaterialUsage = Map<string, { estimate: number; used: number }>;

const LIVE_TIMEOUT_MS = 8000;

export async function loadMaterialUsage(workId: string): Promise<MaterialUsage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.schema('mobile').from('v_material_usage')
      .select('est_doc_resource_id, estimate_quantity, used_quantity')
      .eq('work_id', workId).abortSignal(controller.signal);
    // Пустой ответ — работа не попала в представление: остаёмся на запасном варианте, а не скрываем материалы.
    if (error || !data || data.length === 0) return null;
    return new Map(data.map((r: any) => [String(r.est_doc_resource_id), {
      estimate: Number(r.estimate_quantity ?? 0), used: Number(r.used_quantity ?? 0),
    }]));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Остаток материала; null — неизвестен. */
export function materialRemaining(usage: MaterialUsage | null, resourceId: string, estimateQuantity: number | null): number | null {
  const row = usage?.get(resourceId);
  if (row) return Math.max(row.estimate - row.used, 0);
  return estimateQuantity;
}
