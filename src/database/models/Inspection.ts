import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Проверка технадзора. */
export default class Inspection extends Model {
  static table = 'inspections';

  @field('project_id') projectId: string;
  @field('wbs_item_id') wbsItemId: string | null;
  @field('assignment_id') assignmentId: string | null;
  @field('kind') kind: string;
  @field('result') result: string;
  @field('title') title: string;
  @field('description') description: string | null;
  @field('inspector_id') inspectorId: string | null;
  @field('inspector_name') inspectorName: string | null;
  @field('photo_uri') photoUri: string | null;
  @field('geo_lat') geoLat: number | null;
  @field('geo_lon') geoLon: number | null;
  @field('sync_status') recordSyncStatus: string;
  @date('inspected_at') inspectedAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
