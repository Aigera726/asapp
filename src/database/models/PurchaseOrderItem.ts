import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class PurchaseOrderItem extends Model {
  static table = 'purchase_order_items';
  static associations = {
    purchase_orders: { type: 'belongs_to', key: 'order_id' },
  } as const;

  @field('order_id') orderId: string;
  @field('request_item_id') requestItemId: string;
  @field('quantity') quantity: number;
  @field('actual_price_per_unit') actualPricePerUnit: number;
  @readonly @date('updated_at') updatedAt: Date;
}
