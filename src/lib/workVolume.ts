import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import WorkAssignment from '@/database/models/WorkAssignment';
import EstimateWork from '@/database/models/EstimateWork';
import Report from '@/database/models/Report';
import WorkReport from '@/database/models/WorkReport';
import { localPending, summarizeVolume, VolumeSummary } from '@/database/workVolume';
import { supabase } from '@/lib/supabase';

/** Строка истории: отправка из ERP или свой отчёт, который сервер ещё не показал. */
export type VolumeHistoryEntry = {
  id: string;
  volume: number;
  confirmedVolume: number | null;
  unit: string | null;
  /** Статус ERP или local — отчёт на устройстве / только что отправлен. */
  status: WorkReport['status'] | 'local';
  executorName: string | null;
  reportedAt: Date | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  reason: string | null;
};

export type WorkVolume = { summary: VolumeSummary; history: VolumeHistoryEntry[] };

/** Остаток и история для набора заданий, одним проходом по базе. */
export async function loadWorkVolumes(assignments: WorkAssignment[]): Promise<Map<string, WorkVolume>> {
  const result = new Map<string, WorkVolume>();
  const workIds = Array.from(new Set(assignments.map((a) => a.estimateWorkId).filter(Boolean))) as string[];
  if (workIds.length === 0) return result;

  const [works, siblings, history] = await Promise.all([
    database.get<EstimateWork>('estimate_works').query(Q.where('id', Q.oneOf(workIds))).fetch(),
    database.get<WorkAssignment>('work_assignments').query(Q.where('estimate_work_id', Q.oneOf(workIds))).fetch(),
    database.get<WorkReport>('work_reports').query(Q.where('estimate_work_id', Q.oneOf(workIds))).fetch(),
  ]);
  const reports = await database.get<Report>('reports')
    .query(Q.where('assignment_id', Q.oneOf(siblings.map((s) => s.id)))).fetch();

  const workOf = new Map(siblings.map((s) => [s.id, s.estimateWorkId]));
  const plans = new Map(works.map((w) => [w.id, w.totalQuantity]));
  const knownIds = new Set(history.map((h) => h.mobileReportId).filter(Boolean) as string[]);

  for (const a of assignments) {
    const workId = a.estimateWorkId;
    if (!workId || !plans.has(workId)) continue;
    const workReports = reports.filter((r) => workOf.get(r.assignmentId) === workId);
    const local = localPending(workReports, knownIds, a.id);
    const summary = summarizeVolume({
      plan: plans.get(workId) ?? 0,
      workConfirmed: a.workConfirmedVolume,
      workPending: a.workPendingVolume,
      // 0 приходит и там, где объём назначения не задан: такой предел не ставим.
      assignmentLimit: a.assignedQuantity ? a.assignedQuantity : null,
      assignmentConfirmed: a.assignmentConfirmedVolume,
      assignmentPending: a.assignmentPendingVolume,
      localWorkPending: local.work,
      localAssignmentPending: local.assignment,
    });

    const entries = buildHistory(
      history.filter((h) => h.estimateWorkId === workId).map((h) => ({
        id: h.id,
        volume: h.reportedVolume,
        confirmedVolume: h.confirmedVolume,
        unit: h.unit,
        status: h.status,
        executorName: h.executorName,
        reportedAt: h.reportedAt,
        decidedAt: h.decidedAt,
        decidedByName: h.decidedByName,
        reason: h.rejectionReason ?? h.matchingErrorDetails,
      })),
      workReports, knownIds,
    );

    result.set(a.id, { summary, history: entries });
  }
  return result;
}

export async function loadWorkVolume(assignmentId: string): Promise<WorkVolume | null> {
  const assignment = await database.get<WorkAssignment>('work_assignments').find(assignmentId);
  return (await loadWorkVolumes([assignment])).get(assignmentId) ?? null;
}

/** Серверная история плюс свои отчёты, которых сервер ещё не показал; новые сверху. */
function buildHistory(server: VolumeHistoryEntry[], workReports: Report[], knownIds: Set<string>): VolumeHistoryEntry[] {
  return [
    ...server,
    ...workReports.filter((r) => r.status === 'PENDING' && !knownIds.has(r.id)).map((r) => ({
      id: r.id,
      volume: r.reportedQuantity,
      confirmedVolume: null,
      unit: null,
      status: 'local' as const,
      executorName: null,
      reportedAt: r.createdAt?.getTime() ? r.createdAt : r.updatedAt,
      decidedAt: null,
      decidedByName: null,
      reason: null,
    })),
  ].sort((x, y) => (y.reportedAt?.getTime() ?? 0) - (x.reportedAt?.getTime() ?? 0));
}

const LIVE_TIMEOUT_MS = 8000;
const toDate = (v: unknown) => (v ? new Date(v as string) : null);
const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * Остаток по данным сервера на эту секунду. Синхронизация идёт по
 * расписанию экранов, а решения ERP приходят в любой момент: без этой
 * сверки форма считала от старого снимка (подтвердили 15 из 18 — а телефон
 * всё ещё держал 18 на подтверждении и не давал отправить остаток 5).
 *
 * null — сервер недоступен или миграция 16 не применена; тогда вызывающий
 * остаётся на локальном снимке.
 */
export async function loadLiveWorkVolume(assignmentId: string): Promise<WorkVolume | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const client = supabase.schema('mobile');
    const { data: rows, error } = await client.from('v_assignments')
      .select('id, est_doc_work_id, estimate_volume, assigned_quantity, total_quantity, '
        + 'work_confirmed_volume, work_pending_volume, assignment_confirmed_volume, assignment_pending_volume')
      .eq('id', assignmentId).limit(1).abortSignal(controller.signal);
    const row: any = rows?.[0];
    if (error || !row || row.work_pending_volume === undefined || !row.est_doc_work_id) return null;

    const { data: facts, error: factsError } = await client.from('v_work_reports')
      .select('*').eq('doc_work_id', row.est_doc_work_id).abortSignal(controller.signal);
    if (factsError) return null;

    const siblings = await database.get<WorkAssignment>('work_assignments')
      .query(Q.where('estimate_work_id', row.est_doc_work_id)).fetch();
    const reports = await database.get<Report>('reports')
      .query(Q.where('assignment_id', Q.oneOf([...new Set([assignmentId, ...siblings.map((x) => x.id)])]))).fetch();
    const knownIds = new Set((facts ?? []).map((f: any) => f.mobile_report_id).filter(Boolean) as string[]);
    const local = localPending(reports, knownIds, assignmentId);
    const limit = Number(row.assigned_quantity ?? row.total_quantity ?? 0);

    const summary = summarizeVolume({
      plan: Number(row.estimate_volume ?? 0),
      workConfirmed: num(row.work_confirmed_volume),
      workPending: num(row.work_pending_volume),
      assignmentLimit: limit ? limit : null,
      assignmentConfirmed: num(row.assignment_confirmed_volume),
      assignmentPending: num(row.assignment_pending_volume),
      localWorkPending: local.work,
      localAssignmentPending: local.assignment,
    });
    const history = buildHistory((facts ?? []).map((f: any) => ({
      id: f.id,
      volume: Number(f.reported_volume ?? 0),
      confirmedVolume: num(f.confirmed_volume),
      unit: f.unit ?? null,
      status: f.status,
      executorName: f.executor_name ?? null,
      reportedAt: toDate(f.reported_at),
      decidedAt: toDate(f.decided_at),
      decidedByName: f.decided_by_name ?? null,
      reason: f.rejection_reason ?? f.matching_error_details ?? null,
    })), reports, knownIds);
    return { summary, history };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
