import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type AddendumStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
/** Изменение объёма работы в ДС: было → стало; added — новая работа договора. */
export type AddendumChange = {
  assignment_id: string | null;
  work_name: string;
  unit: string | null;
  change: 'INCREASE' | 'STORNO_PARTIAL' | 'STORNO_FULL';
  added: boolean;
  old_quantity: number;
  new_quantity: number;
};

/**
 * Доп. соглашение к договору организации — снимок ERP (mobile.v_contract_addenda, миграция 17).
 * Только чтение: для уведомлений и разового окна «ДС согласовано».
 */
export default class ContractAddendum extends Model {
  static table = 'contract_addenda';

  @field('contract_id') contractId: string;
  @field('contract_number') contractNumber: string | null;
  @field('project_name') projectName: string | null;
  @field('object_name') objectName: string | null;
  @field('number') number: number;
  @field('status') status: AddendumStatus;
  @field('addendum_date') addendumDate: string | null;
  @date('submitted_at') submittedAt: Date | null;
  @date('decided_at') decidedAt: Date | null;
  @field('decision_comment') decisionComment: string | null;
  /** JSON-массив AddendumChange. */
  @field('changes') changesJson: string | null;
  @readonly @date('updated_at') updatedAt: Date;

  get changes(): AddendumChange[] {
    try { const list = JSON.parse(this.changesJson || '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
  }
}
