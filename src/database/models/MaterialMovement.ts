import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Строка складского журнала по материалам. Остаток — агрегация этих строк. */
export default class MaterialMovement extends Model {
  static table = 'material_movements';

  @field('project_id') projectId: string;
  @field('resource_id') resourceId: string | null;
  @field('material_name') materialName: string;
  @field('unit') unit: string | null;
  @field('type') type: string;
  @field('quantity') quantity: number;
  @field('wbs_item_id') wbsItemId: string | null;
  @field('receipt_id') receiptId: string | null;
  @field('comment') comment: string | null;
  @field('photo_uri') photoUri: string | null;
  @field('created_by') createdBy: string | null;
  @field('sync_status') recordSyncStatus: string;
  @date('occurred_at') occurredAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
