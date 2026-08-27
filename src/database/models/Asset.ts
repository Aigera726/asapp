import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Единица учёта: оборудование, техника или инструмент. */
export default class Asset extends Model {
  static table = 'assets';

  @field('kind') kind: string;
  @field('name') name: string;
  @field('category') category: string | null;
  @field('inventory_number') inventoryNumber: string | null;
  @field('serial_number') serialNumber: string | null;
  @field('model') model: string | null;
  @field('status') status: string;
  @field('project_id') projectId: string | null;
  @field('holder_id') holderId: string | null;
  @field('holder_name') holderName: string | null;
  @field('total_hours') totalHours: number | null;
  @field('photo_uri') photoUri: string | null;
  @field('ext_id') extId: string | null;
  @date('commissioned_at') commissionedAt: Date | null;
  @date('next_service_at') nextServiceAt: Date | null;
  @readonly @date('updated_at') updatedAt: Date;
}
