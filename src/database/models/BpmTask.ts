import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class BpmTask extends Model {
  static table = 'bpm_tasks';
  static associations = {
    bpm_instances: { type: 'belongs_to', key: 'instance_id' },
  } as const;

  @field('instance_id') instanceId: string;
  @field('assignee_id') assigneeId: string;
  @field('step_label') stepLabel: string;
  @field('action_type') actionType: string;
  @field('status') status: string;
  @field('comment') comment: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
