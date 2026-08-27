import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import PurchaseRequestItem from './PurchaseRequestItem';

export default class PurchaseRequest extends Model {
  static table = 'purchase_requests';
  static associations = {
    purchase_request_items: { type: 'has_many', foreignKey: 'request_id' },
  } as const;

  @field('project_id') projectId: string;
  @field('requested_by') requestedBy: string;
  @field('status') status: string;
  @field('required_date') requiredDate: number | null;
  @field('comment') comment: string | null;
  @field('request_number') requestNumber: number | null;
  @readonly @date('updated_at') updatedAt: Date;

  @children('purchase_request_items') items: PurchaseRequestItem[];
}
