import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Техническое отклонение: запрос на отступление от проекта/технологии. */
export default class Deviation extends Model {
  static table = 'deviations';

  @field('number') number: string | null;
  @field('project_id') projectId: string;
  @field('wbs_item_id') wbsItemId: string | null;
  @field('category') category: string;
  @field('status') status: string;
  @field('title') title: string;
  @field('description') description: string | null;
  @field('reason') reason: string | null;
  @field('proposed_solution') proposedSolution: string | null;
  @field('requested_by') requestedBy: string | null;
  @field('requested_by_name') requestedByName: string | null;
  @field('decision_comment') decisionComment: string | null;
  @field('decided_by') decidedBy: string | null;
  @field('photo_uri') photoUri: string | null;
  @field('sync_status') recordSyncStatus: string;
  @date('decided_at') decidedAt: Date | null;
  @date('requested_at') requestedAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
