/**
 * Остаток объёма работы: доступно = план − подтверждено − на подтверждении.
 *
 * Подтверждённое и ожидающее по серверу приходят из витрины заданий
 * (миграция 16). Свои отчёты, которых сервер ещё не показал, досчитываются
 * локально: неотправленные без сети и только что отправленные — синхронизация
 * читает данные до отправки, и сводка их ещё не учитывает.
 */

export type VolumeInput = {
  plan: number;
  workConfirmed: number | null;
  workPending: number | null;
  /** Объём назначения по договору; null — предела нет. */
  assignmentLimit: number | null;
  assignmentConfirmed: number | null;
  assignmentPending: number | null;
  /** Свои ожидающие отчёты по работе, которых нет в истории сервера. */
  localWorkPending: number;
  localAssignmentPending: number;
};

export type VolumeSummary = {
  plan: number;
  confirmed: number;
  pending: number;
  available: number;
  /** Остаток по договору организации, если он меньше остатка по работе. */
  assignmentAvailable: number | null;
  /** Сколько можно отправить в следующем отчёте. */
  limit: number;
};

const round = (v: number) => Math.round(v * 1000) / 1000;

export function summarizeVolume(input: VolumeInput): VolumeSummary {
  const confirmed = round(input.workConfirmed ?? 0);
  const pending = round((input.workPending ?? 0) + input.localWorkPending);
  const available = Math.max(0, round(input.plan - confirmed - pending));
  const assignmentAvailable = input.assignmentLimit == null ? null : Math.max(0, round(
    input.assignmentLimit - (input.assignmentConfirmed ?? 0)
      - (input.assignmentPending ?? 0) - input.localAssignmentPending,
  ));
  return {
    plan: input.plan,
    confirmed,
    pending,
    available,
    assignmentAvailable,
    limit: assignmentAvailable == null ? available : Math.min(available, assignmentAvailable),
  };
}

type LocalReport = { id: string; assignmentId: string; reportedQuantity: number; status: string };

/**
 * Свои ожидающие отчёты, которых ещё нет в истории сервера. Отчёт уже в
 * истории учтён сервером (или не резервирует объём, как matching_error).
 */
export function localPending(
  reports: LocalReport[],
  knownReportIds: Set<string>,
  assignmentId: string,
): { work: number; assignment: number } {
  let work = 0;
  let assignment = 0;
  for (const r of reports) {
    if (r.status !== 'PENDING' || knownReportIds.has(r.id)) continue;
    work += r.reportedQuantity;
    if (r.assignmentId === assignmentId) assignment += r.reportedQuantity;
  }
  return { work: round(work), assignment: round(assignment) };
}
