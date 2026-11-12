import type { DeliveryIssue } from './sync-delivery';

/**
 * Отчёт, который сервер не принял (а не просто не дошёл из-за связи). Такой отчёт остаётся на телефоне,
 * но больше не резервирует объём работы: прораб видит причину и может удалить его или внести заново.
 *  overLimit — объём больше доступного; addendum — по работе идёт ДС на согласовании;
 *  assignment — задание недоступно; write — другой отказ сервера (текст ответа сохраняется).
 */
export type RefusalCode = 'overLimit' | 'addendum' | 'assignment' | 'write';
export type ReportRefusal = { code: RefusalCode; detail?: string; at: number };

export function refusalOf(issue: DeliveryIssue): RefusalCode | null {
  if (issue.table !== 'reports') return null;
  if (issue.code === 'addendum' || issue.code === 'assignment') return issue.code;
  // Без кода ответа сервера — обрыв связи или тайм-аут: отчёт уйдёт сам при следующей синхронизации.
  if (issue.code !== 'write' || !issue.serverCode) return null;
  return /больше доступного/i.test(issue.detail || '') ? 'overLimit' : 'write';
}

/** Отказы этой отправки дополняют прежние; ошибка связи прежний отказ не стирает. */
export function mergeRefusals(prev: Record<string, ReportRefusal>, issues: DeliveryIssue[], now: number): Record<string, ReportRefusal> {
  const next = { ...prev };
  for (const issue of issues) {
    const code = refusalOf(issue);
    if (code) next[issue.id] = { code, detail: issue.detail, at: now };
  }
  return next;
}

/** ДС на согласовании, который меняет объём этого задания (снимок mobile.v_contract_addenda). */
export function blockingAddendum<A extends { status: string; changes: { assignment_id: string | null }[] }>(addenda: A[], assignmentId: string): A | null {
  return addenda.find(a => a.status === 'PENDING_APPROVAL' && a.changes.some(c => c.assignment_id === assignmentId)) || null;
}
