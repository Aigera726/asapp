import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import PurchaseOrderItem from './PurchaseOrderItem';

export default class PurchaseOrder extends Model {
  static table = 'purchase_orders';
  static associations = {
    purchase_order_items: { type: 'has_many', foreignKey: 'order_id' },
  } as const;

  @field('request_id') requestId: string;
  @field('supplier_id') supplierId: string | null;
  @field('invoice_number') invoiceNumber: string | null;
  @field('total_amount') totalAmount: number;
  @field('status') status: string;
  @readonly @date('updated_at') updatedAt: Date;

  @children('purchase_order_items') items: PurchaseOrderItem[];
}
