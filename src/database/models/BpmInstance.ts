import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators';
import BpmTask from './BpmTask';

export default class BpmInstance extends Model {
  static table = 'bpm_instances';
  static associations = {
    bpm_tasks: { type: 'has_many', foreignKey: 'instance_id' },
  } as const;

  @field('document_id') documentId: string;
  @field('status') status: string;
  @field('current_step') currentStep: number;
  @readonly @date('updated_at') updatedAt: Date;

  @children('bpm_tasks') tasks: BpmTask[];
}
