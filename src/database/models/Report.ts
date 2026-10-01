import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type ReportSyncStatus = 'draft' | 'pending_sync' | 'synced';
export type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export default class Report extends Model {
  static table = 'reports';

  @field('assignment_id') assignmentId: string;
  @field('reported_by') reportedBy: string | null;
  @field('reported_quantity') reportedQuantity: number;
  @field('status') status: ReportStatus;
  @field('comment') comment: string | null;
  @field('resource_usage') resourceUsage: string | null;
  @field('geo_lat') geoLat: number | null;
  @field('geo_lon') geoLon: number | null;
  @field('photo_uri') photoUri: string | null;
  @field('sync_status') reportSyncStatus: ReportSyncStatus;
  @date('created_at') createdAt: Date | null;
  @readonly @date('updated_at') updatedAt: Date;
}
