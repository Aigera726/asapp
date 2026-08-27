import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class PurchaseRequestItem extends Model {
  static table = 'purchase_request_items';

  @field('request_id') requestId: string;
  @field('resource_id') resourceId: string | null;
  @field('estimate_work_id') estimateWorkId: string | null;
  @field('wbs_item_id') wbsItemId: string | null;
  @field('requested_quantity') requestedQuantity: number;
  @field('received_quantity') receivedQuantity: number;
  @field('item_name') itemName: string | null;
  @field('unit') unit: string | null;
  @field('status') status: string;
  @readonly @date('updated_at') updatedAt: Date;
}
