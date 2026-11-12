import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import ContractAddendum from '@/database/models/ContractAddendum';
import { blockingAddendum } from './report-refusals';

/** Номер ДС на согласовании, который меняет объём задания, или null. Снимок устройства: обновляется синхронизацией. */
export async function pendingAddendumFor(assignmentId: string): Promise<{ number: number; contractNumber: string | null } | null> {
  try {
    const list = await database.get<ContractAddendum>('contract_addenda').query(Q.where('status', 'PENDING_APPROVAL')).fetch();
    const found = blockingAddendum(list.map(a => ({ status: a.status, changes: a.changes, number: a.number, contractNumber: a.contractNumber })), assignmentId);
    return found ? { number: found.number, contractNumber: found.contractNumber } : null;
  } catch {
    return null;
  }
}

/** Задания, по которым идёт ДС на согласовании: id задания → номер ДС. */
export async function pendingAddendaByAssignment(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const list = await database.get<ContractAddendum>('contract_addenda').query(Q.where('status', 'PENDING_APPROVAL')).fetch();
    for (const a of list) for (const c of a.changes) if (c.assignment_id && !out.has(c.assignment_id)) out.set(c.assignment_id, a.number);
  } catch { /* таблицы ДС ещё нет — пометок нет */ }
  return out;
}
