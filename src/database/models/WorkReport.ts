import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Статус карточки оперфакта в ERP. */
export type WorkReportStatus = 'pending_approval' | 'approved' | 'rejected' | 'matching_error';

/**
 * Отправленный объём по работе — снимок оперфакта ERP (mobile.v_work_reports).
 * Только чтение: наполняется синхронизацией, отчёты всех сотрудников организации.
 */
export default class WorkReport extends Model {
  static table = 'work_reports';

  @field('mobile_report_id') mobileReportId: string | null;
  @field('assignment_id') assignmentId: string | null;
  @field('estimate_work_id') estimateWorkId: string | null;
  @field('reported_volume') reportedVolume: number;
  @field('confirmed_volume') confirmedVolume: number | null;
  @field('unit') unit: string | null;
  @field('status') status: WorkReportStatus;
  @field('executor_name') executorName: string | null;
  @date('reported_at') reportedAt: Date | null;
  @date('decided_at') decidedAt: Date | null;
  @field('decided_by_name') decidedByName: string | null;
  @field('rejection_reason') rejectionReason: string | null;
  @field('matching_error_details') matchingErrorDetails: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
