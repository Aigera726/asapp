import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/** Движение по единице учёта: выдача, возврат, перемещение, ремонт, смена. */
export default class AssetMovement extends Model {
  static table = 'asset_movements';
  static associations = {
    assets: { type: 'belongs_to', key: 'asset_id' },
  } as const;

  @field('asset_id') assetId: string;
  @field('type') type: string;
  @field('project_id') projectId: string | null;
  @field('from_holder') fromHolder: string | null;
  @field('to_holder') toHolder: string | null;
  @field('hours') hours: number | null;
  @field('comment') comment: string | null;
  @field('photo_uri') photoUri: string | null;
  @field('created_by') createdBy: string | null;
  @field('sync_status') recordSyncStatus: string;
  @date('occurred_at') occurredAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
