/**
 * Уведомления мобилки (как колокольчик в УСП): ДС к договорам организации и решения ERP по отправленным объёмам.
 * Собираются из локальной базы после синхронизации, без отдельного сервера уведомлений.
 * id включает статус: смена статуса ДС или отчёта даёт новое (непрочитанное) уведомление.
 */
import type { AddendumChange, AddendumStatus } from '@/database/models/ContractAddendum';

export const NOTICE_DAYS = 30;
const DAY = 86400000;

export type AddendumNotice = {
  kind: 'addendum'; id: string; at: number; addendumId: string; status: AddendumStatus; number: number;
  contractNumber: string | null; projectName: string | null; objectName: string | null;
  reason: string | null; changes: AddendumChange[];
};
export type ReportNotice = {
  kind: 'report'; id: string; at: number; status: 'approved' | 'rejected'; workName: string; unit: string | null;
  reported: number; confirmed: number | null; decidedBy: string | null; reason: string | null;
};
export type Notice = AddendumNotice | ReportNotice;

type AddendumRow = { id: string; status: AddendumStatus; number: number; contractNumber: string | null; projectName: string | null;
  objectName: string | null; submittedAt: Date | null; decidedAt: Date | null; decisionComment: string | null; changes: AddendumChange[] };
type ReportRow = { id: string; status: string; estimateWorkId: string | null; unit: string | null; reportedVolume: number;
  confirmedVolume: number | null; decidedAt: Date | null; decidedByName: string | null; rejectionReason: string | null };

const time = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d.getTime() : 0);

/** Последние NOTICE_DAYS дней, новые сверху. workNames — названия работ сметы по id. */
export function buildNotices(addenda: AddendumRow[], reports: ReportRow[], workNames: Map<string, string>, now = Date.now()): Notice[] {
  const from = now - NOTICE_DAYS * DAY, list: Notice[] = [];
  for (const a of addenda) {
    const at = a.status === 'PENDING_APPROVAL' ? time(a.submittedAt) : time(a.decidedAt);
    if (at < from) continue;
    list.push({ kind: 'addendum', id: `ad:${a.id}:${a.status}`, at, addendumId: a.id, status: a.status, number: a.number,
      contractNumber: a.contractNumber, projectName: a.projectName, objectName: a.objectName,
      reason: a.status === 'REJECTED' ? a.decisionComment : null, changes: a.changes });
  }
  for (const r of reports) {
    if (r.status !== 'approved' && r.status !== 'rejected') continue;
    const at = time(r.decidedAt);
    if (at < from) continue;
    list.push({ kind: 'report', id: `rep:${r.id}:${r.status}`, at, status: r.status,
      workName: (r.estimateWorkId && workNames.get(r.estimateWorkId)) || '—', unit: r.unit,
      reported: r.reportedVolume, confirmed: r.confirmedVolume, decidedBy: r.decidedByName, reason: r.rejectionReason });
  }
  return list.sort((x, y) => y.at - x.at);
}

/** Работы ДС, по которым объём не принимается, пока ДС на согласовании (новые работы ещё не в договоре). */
export const blockedWorks = (n: AddendumNotice) => n.changes.filter(c => !c.added).map(c => c.work_name);

/**
 * Первая загрузка (отметок ещё нет): старше FIRST_RUN_DAYS считаем прочитанным,
 * чтобы после установки не было десятков «новых» уведомлений.
 */
export const FIRST_RUN_DAYS = 3;
export function initialSeen(notices: Notice[], now = Date.now()): string[] {
  return notices.filter(n => n.at < now - FIRST_RUN_DAYS * DAY).map(n => n.id);
}

/** Согласованные ДС для разового окна: ещё не показанные, за последние NOTICE_DAYS дней, старые первыми. */
export function approvedToShow(notices: Notice[], shown: Set<string>): AddendumNotice[] {
  return notices.filter((n): n is AddendumNotice => n.kind === 'addendum' && n.status === 'APPROVED' && !shown.has(n.addendumId))
    .sort((x, y) => x.at - y.at);
}
