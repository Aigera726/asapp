import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import WarehouseReceiptItem from './WarehouseReceiptItem';

export default class WarehouseReceipt extends Model {
  static table = 'warehouse_receipts';
  static associations = {
    warehouse_receipt_items: { type: 'has_many', foreignKey: 'receipt_id' },
  } as const;

  @field('order_id') orderId: string;
  @field('received_by') receivedBy: string;
  @date('received_at') receivedAt: Date;
  @field('photo_url') photoUrl: string | null;
  @field('comment') comment: string | null;
  @readonly @date('updated_at') updatedAt: Date;

  @children('warehouse_receipt_items') items: WarehouseReceiptItem[];
}
