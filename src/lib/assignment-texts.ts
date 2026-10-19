export type LocalizedText = Partial<Record<'ru' | 'en' | 'ka' | 'az', string>>;
export type AssignmentTextRow = {
  id: string; assignment_id: string; entity_id: string; entity_kind: 'work' | 'resource';
  names: LocalizedText | null; units: LocalizedText | null;
};
export type AssignmentTexts = { works: Record<string, AssignmentTextRow>; resources: Record<string, AssignmentTextRow> };
export function indexAssignmentTexts(rows: AssignmentTextRow[]): AssignmentTexts {
  const result: AssignmentTexts = { works: {}, resources: {} };
  for (const row of rows) {
    if (!row || typeof row.assignment_id !== 'string' || typeof row.entity_id !== 'string') continue;
    if (row.entity_kind === 'work') result.works[row.assignment_id] = row;
    else if (row.entity_kind === 'resource') result.resources[row.entity_id] = row;
  }
  return result;
}
export function localizedValue(values: LocalizedText | null | undefined, language: keyof LocalizedText, fallback: string): string {
  const value = values?.[language];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
