import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import WorkAssignment from '@/database/models/WorkAssignment';
import EstimateWork from '@/database/models/EstimateWork';
import EstimateResource from '@/database/models/EstimateResource';

export type EstimateReportPlan = {
  workQuantity: number;
  assignedQuantity: number | null;
  resources: {
    resourceId: string;
    name: string;
    unit: string;
    kind: string | null;
    norm: number | null;
    quantity: number | null;
  }[];
};

/** Только снимок фактической сметы ERP. Складские движения здесь не участвуют. */
export async function loadEstimateReportPlan(id: string): Promise<EstimateReportPlan> {
  const assignment = await database.get<WorkAssignment>('work_assignments').find(id);
  if (!assignment.isAvailable || !assignment.estimateWorkId) {
    throw new Error('Нет доступной работы фактической сметы. Обновите данные.');
  }
  const work = await database.get<EstimateWork>('estimate_works').find(assignment.estimateWorkId);
  const resources = await database.get<EstimateResource>('estimate_resources')
    .query(Q.where('estimate_work_id', work.id)).fetch();
  if (resources.some((r) => !r.inActualEstimate && r.norm != null)) {
    throw new Error('Обновите данные на главном экране, чтобы загрузить количества фактической сметы.');
  }
  return {
    workQuantity: work.totalQuantity,
    assignedQuantity: assignment.assignedQuantity,
    resources: resources.filter((r) => r.inActualEstimate).map((r) => ({
      resourceId: r.id, name: r.name, unit: r.unit, kind: r.resourceKind,
      norm: r.norm, quantity: r.estimateQuantity,
    })),
  };
}
