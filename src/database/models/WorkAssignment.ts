import { Model, Relation } from '@nozbe/watermelondb';
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators';
import EstimateWork from './EstimateWork';
import WbsItem from './WbsItem';
import EstimateResource from './EstimateResource';
import Contract from './Contract';

export default class WorkAssignment extends Model {
  static table = 'work_assignments';
  static associations = {
    contracts: { type: 'belongs_to', key: 'contract_id' },
    estimate_works: { type: 'belongs_to', key: 'estimate_work_id' },
    wbs_items: { type: 'belongs_to', key: 'wbs_item_id' },
    estimate_resources: { type: 'belongs_to', key: 'resource_id' },
  } as const;

  @field('estimate_work_id') estimateWorkId: string | null;
  @field('wbs_item_id') wbsItemId: string | null;
  @field('resource_id') resourceId: string | null;

  @field('contract_id') contractId: string;
  @field('is_available') isAvailable: boolean;
  @field('assignment_type') assignmentType: 'FIXED' | 'OPEN';
  @field('assigned_quantity') assignedQuantity: number | null;
  @field('status') status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SUSPENDED';
  // Объёмы ERP: по работе от всех исполнителей и по этому назначению договора.
  @field('work_confirmed_volume') workConfirmedVolume: number | null;
  @field('work_pending_volume') workPendingVolume: number | null;
  @field('assignment_confirmed_volume') assignmentConfirmedVolume: number | null;
  @field('assignment_pending_volume') assignmentPendingVolume: number | null;
  @readonly @date('updated_at') updatedAt: Date;

  // Relations
  //
  // Без «!»: Babel не принимает definite assignment на декорированном поле
  // («Definitely assigned fields cannot be initialized here»), из-за чего
  // web-бандл падал на трансформации этого файла. Значения проставляет
  // декоратор @relation, а strictPropertyInitialization в tsconfig отключён —
  // как и во всех остальных моделях.
  @relation('contracts', 'contract_id') contract: Relation<Contract>;
  @relation('estimate_works', 'estimate_work_id') estimateWork: Relation<EstimateWork>;
  @relation('wbs_items', 'wbs_item_id') wbsItem: Relation<WbsItem>;
  @relation('estimate_resources', 'resource_id') resource: Relation<EstimateResource>;
}
