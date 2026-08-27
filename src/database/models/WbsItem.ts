import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class WbsItem extends Model {
  static table = 'wbs_items';

  @field('project_id') projectId: string;
  @field('name') name: string;
  @field('ext_id') extId: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
