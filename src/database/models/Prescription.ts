import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Предписание: требование устранить нарушение к сроку. */
export default class Prescription extends Model {
  static table = 'prescriptions';

  @field('number') number: string | null;
  @field('project_id') projectId: string;
  @field('inspection_id') inspectionId: string | null;
  @field('contractor_id') contractorId: string | null;
  @field('issued_by') issuedBy: string | null;
  @field('issued_by_name') issuedByName: string | null;
  @field('severity') severity: string;
  @field('status') status: string;
  @field('title') title: string;
  @field('description') description: string | null;
  @field('requirement') requirement: string | null;
  @field('photo_uri') photoUri: string | null;
  @field('resolution_comment') resolutionComment: string | null;
  @field('resolution_photo_uri') resolutionPhotoUri: string | null;
  @field('sync_status') recordSyncStatus: string;
  @date('due_at') dueAt: Date | null;
  @date('resolved_at') resolvedAt: Date | null;
  @date('closed_at') closedAt: Date | null;
  @date('issued_at') issuedAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
