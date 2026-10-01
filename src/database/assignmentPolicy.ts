/** Поля витрины mobile.v_assignments, миграция 11. */
export function isEligibleAssignment(row: any): boolean {
  return row.contract_status === 'APPROVED' && row.estimate_type === 'actual';
}

// Ноль — осознанное значение факта, а не повод брать обычную норму.
export function actualValue(fact: unknown, base: unknown): number | null {
  const value = fact ?? base;
  return value == null ? null : Number(value);
}

/** Сохраняем связи старых отчётов, но убираем недоступные задания из выбора. */
export function unavailableAssignments(existing: any[], incoming: any[]): any[] {
  const ids = new Set(incoming.map((r) => r.id));
  return existing.filter((r) => !ids.has(r.id)).map((r) => {
    const { _status, _changed, ...fields } = r;
    return { ...fields, is_available: false };
  });
}

/** Считываем до пустой страницы: сервер может ограничить размер ответа. */
export async function readAllView(client: any, view: string) {
  const data: any[] = [];
  for (;;) {
    let query = client.from(view).select('*').order('id');
    if (view === 'v_assignment_resources') query = query.order('assignment_id');
    const result = await query.range(data.length, data.length + 499);
    if (result.error) return { data: null, error: result.error };
    if (!result.data?.length) return { data, error: null };
    data.push(...result.data);
  }
}
