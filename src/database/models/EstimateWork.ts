import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class EstimateWork extends Model {
  static table = 'estimate_works';

  @field('version_id') versionId: string;
  @field('name') name: string;
  @field('unit') unit: string;
  @field('total_quantity') totalQuantity: number;
  @field('ext_id') extId: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
