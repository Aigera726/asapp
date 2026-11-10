import { translate, type Language } from './messages';
import { displayQty, unitLabel } from './work';
import { blockedWorks, type Notice } from '@/lib/notices';
import type { AddendumChange } from '@/database/models/ContractAddendum';

/** «Новая работа: … — 10 м²», «Работа: 34 → 40 м²», «Работа: снята (было 7 т)». */
export function changeLine(c: AddendumChange, language: Language): string {
  const unit = unitLabel(c.unit, language), q = (v: number) => displayQty(Number(v || 0), language);
  if (c.added) return translate(language, 'notice.changeAdded', { work: c.work_name, qty: q(c.new_quantity), unit });
  if (c.change === 'STORNO_FULL') return translate(language, 'notice.changeRemoved', { work: c.work_name, old: q(c.old_quantity), unit });
  return translate(language, 'notice.changeQty', { work: c.work_name, old: q(c.old_quantity), new: q(c.new_quantity), unit });
}

export function noticeTitle(n: Notice, language: Language): string {
  if (n.kind === 'report') return translate(language, n.status === 'approved' ? 'notice.reportApproved' : 'notice.reportRejected');
  const key = n.status === 'PENDING_APPROVAL' ? 'notice.adPending' : n.status === 'APPROVED' ? 'notice.adApproved' : 'notice.adRejected';
  return translate(language, key, { n: String(n.number), contract: n.contractNumber || '—' });
}

export function noticeBody(n: Notice, language: Language): string {
  if (n.kind === 'report') {
    const unit = unitLabel(n.unit, language), q = (v: number | null) => displayQty(Number(v || 0), language);
    return n.status === 'approved'
      ? translate(language, 'notice.reportApprovedBody', { work: n.workName, confirmed: q(n.confirmed), reported: q(n.reported), unit })
      : translate(language, 'notice.reportRejectedBody', { work: n.workName, reported: q(n.reported), unit, reason: n.reason || '—' });
  }
  const place = [n.projectName, n.objectName].filter(Boolean).join(' · ');
  let text = '';
  if (n.status === 'PENDING_APPROVAL') {
    const works = blockedWorks(n);
    text = works.length ? translate(language, 'notice.pendingBlocked', { works: works.join(', ') }) : translate(language, 'notice.pendingFree');
  } else if (n.status === 'REJECTED') {
    text = n.reason ? translate(language, 'notice.rejectedBody', { reason: n.reason }) : translate(language, 'notice.rejectedNoReason');
  } else {
    text = n.changes.map(c => changeLine(c, language)).join('\n');
  }
  return [place, text].filter(Boolean).join('\n');
}
