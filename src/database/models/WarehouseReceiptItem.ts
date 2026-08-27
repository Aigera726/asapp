import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class WarehouseReceiptItem extends Model {
  static table = 'warehouse_receipt_items';
  static associations = {
    warehouse_receipts: { type: 'belongs_to', key: 'receipt_id' },
  } as const;

  @field('receipt_id') receiptId: string;
  @field('request_item_id') requestItemId: string;
  @field('received_quantity') receivedQuantity: number;
  @field('quality_status') qualityStatus: string; // OK, DAMAGED, SHORTAGE
  @readonly @date('updated_at') updatedAt: Date;
}
