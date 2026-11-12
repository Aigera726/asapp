// Строки списка: заголовок договора и карточки его работ.
export type ContractHead = { kind: 'contract'; id: string; contract_id: string; number: string; contractor: string; amount: number | null; currency: string | null;
  start: string | null; end: string | null; count: number; collapsed: boolean };
/** Работы, сгруппированные по договорам в порядке первого появления; у свёрнутого договора — только заголовок. */
export function contractRows<W extends { contract_id: string; contract_number: string; contractor_name: string;
  contract_amount?: number | null; contract_currency?: string | null; contract_start?: string | null; contract_end?: string | null }>(items: W[], collapsed: Set<string>): (W | ContractHead)[] {
  const groups = new Map<string, W[]>();
  for (const item of items) { const list = groups.get(item.contract_id); if (list) list.push(item); else groups.set(item.contract_id, [item]); }
  const out: (W | ContractHead)[] = [];
  for (const [id, list] of groups) {
    const first = list[0], closed = collapsed.has(id);
    out.push({ kind: 'contract', id: `contract:${id}`, contract_id: id, number: first.contract_number, contractor: first.contractor_name,
      amount: first.contract_amount ?? null, currency: first.contract_currency ?? null, start: first.contract_start ?? null, end: first.contract_end ?? null,
      count: list.length, collapsed: closed });
    if (!closed) out.push(...list);
  }
  return out;
}
