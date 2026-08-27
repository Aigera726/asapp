import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class EstimateResource extends Model {
  static table = 'estimate_resources';

  @field('name') name: string;
  @field('unit') unit: string;
  @field('type_id') typeId: number;
  /** Норма расхода на единицу работы (на сервере — norm_per_unit). */
  @field('norm') norm: number;
  @field('estimate_work_id') estimateWorkId: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
