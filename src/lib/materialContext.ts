type MovementIdentity = {
  projectId: string | null;
  resourceId: string | null;
  wbsItemId: string | null;
  materialName: string;
  unit: string | null;
};

/** Разные объекты, строки сметы, работы и единицы не объединяются по названию. */
export function materialMovementKey(m: MovementIdentity): string {
  return JSON.stringify([m.projectId, m.resourceId, m.wbsItemId,
    m.materialName.trim().toLowerCase(), (m.unit ?? '').trim().toLowerCase()]);
}
