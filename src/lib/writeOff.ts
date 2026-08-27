import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import { MATERIAL_MOVEMENT_SIGN, formatQty, materialBalanceKey } from '@/lib/domain';
import WorkAssignment from '@/database/models/WorkAssignment';
import EstimateResource from '@/database/models/EstimateResource';
import Contract from '@/database/models/Contract';
import MaterialMovement from '@/database/models/MaterialMovement';

/**
 * Списание материалов по нормам сметы.
 *
 * Норма (estimate_resources.norm) задана на единицу работы, поэтому расход по
 * отчёту = норма × выполненный объём. Фактическое количество прораб может
 * поправить: норма — это план, а М-29 требует показывать именно расхождение,
 * поэтому отклонение уходит в комментарий движения, а не затирает норму.
 */

/** Ресурс сметы, участвующий в списании, вместе с текущим остатком. */
export type NormResource = {
  resourceId: string;
  name: string;
  unit: string | null;
  /** Норма расхода на единицу работы. */
  norm: number;
  /** Остаток по складу объекта на момент загрузки. */
  balance: number;
};

export type WriteOffPlan = {
  /** Объект, на склад которого пойдёт списание. null — списывать некуда. */
  projectId: string | null;
  wbsItemId: string | null;
  resources: NormResource[];
};

/**
 * Собирает нормы по заданию и текущие остатки. Пустой список ресурсов — не
 * ошибка: задание может быть выдано на материал или на пункт ГПР, у которых
 * норм расхода нет.
 */
export async function loadWriteOffPlan(assignmentId: string): Promise<WriteOffPlan> {
  const assignment = await database.collections
    .get<WorkAssignment>('work_assignments')
    .find(assignmentId);

  const contract = assignment.contractId
    ? await database.collections
        .get<Contract>('contracts')
        .find(assignment.contractId)
        .catch(() => null)
    : null;

  const projectId = contract?.projectId ?? null;
  const empty: WriteOffPlan = { projectId, wbsItemId: assignment.wbsItemId, resources: [] };

  if (!assignment.estimateWorkId || !projectId) return empty;

  const resources = await database.collections
    .get<EstimateResource>('estimate_resources')
    .query(Q.where('estimate_work_id', assignment.estimateWorkId))
    .fetch();

  const withNorm = resources.filter((r) => Number(r.norm) > 0);
  if (withNorm.length === 0) return empty;

  const movements = await database.collections
    .get<MaterialMovement>('material_movements')
    .query(Q.where('project_id', projectId))
    .fetch();

  const balances = new Map<string, number>();
  for (const m of movements) {
    const key = materialBalanceKey(m.materialName);
    const sign = MATERIAL_MOVEMENT_SIGN[m.type] ?? 1;
    balances.set(key, (balances.get(key) ?? 0) + sign * (m.quantity || 0));
  }

  return {
    projectId,
    wbsItemId: assignment.wbsItemId,
    resources: withNorm.map((r) => ({
      resourceId: r.id,
      name: r.name,
      unit: r.unit ?? null,
      norm: Number(r.norm),
      balance: balances.get(materialBalanceKey(r.name)) ?? 0,
    })),
  };
}

/** Расход по норме на заявленный объём работы. */
export function normedQuantity(norm: number, workQuantity: number): number {
  return Math.round(norm * workQuantity * 1000) / 1000;
}

/**
 * Комментарий к движению. Отклонение от нормы пишем явно: по этой строке
 * потом собирается расхождение «норма / факт» без обратного пересчёта.
 */
export function writeOffComment(
  workName: string | undefined,
  planned: number,
  actual: number,
  userComment: string
): string {
  const parts = [`Списание по нормам${workName ? `: ${workName}` : ''}`];
  if (Math.abs(actual - planned) > 1e-6) {
    const diff = actual - planned;
    parts.push(
      `Отклонение от нормы: ${diff > 0 ? '+' : '−'}${formatQty(Math.abs(diff))} ` +
        `(норма ${formatQty(planned)}, факт ${formatQty(actual)})`
    );
  }
  if (userComment.trim()) parts.push(userComment.trim());
  return parts.join('. ');
}
