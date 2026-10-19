import { useEffect, useMemo, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import WorkAssignment from '@/database/models/WorkAssignment';
import { useAssignmentTexts } from './useAssignmentTexts';
import { useTranslation } from '@/i18n';
import { localizedValue } from '@/lib/assignment-texts';
import { demoName, unitLabel } from '@/i18n/work';
import { useAuthStore } from '@/store/authStore';

/** Only catalogue-backed names are localized. IDs and free-text records remain unchanged. */
export function useResourceDisplay() {
  const { language } = useTranslation();
  const demo = useAuthStore(state => state.isDemoMode);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  useEffect(() => {
    const sub = database.get<WorkAssignment>('work_assignments').query(Q.where('is_available', true)).observe().subscribe(setAssignments);
    return () => sub.unsubscribe();
  }, []);
  const { texts, unavailable } = useAssignmentTexts(assignments.map(a => a.id));
  const byWork = useMemo(() => {
    const result: Record<string, typeof texts.works[string]> = {};
    for (const assignment of assignments) if (assignment.estimateWorkId && texts.works[assignment.id]) result[assignment.estimateWorkId] = texts.works[assignment.id];
    return result;
  }, [assignments, texts]);
  const rawName = (raw: string) => demo ? demoName(raw, language) : raw;
  return {
    version: texts,
    unavailable,
    name: (id: string | null | undefined, raw: string) => localizedValue(id ? texts.resources[id]?.names : undefined, language, rawName(raw)),
    unit: (id: string | null | undefined, raw?: string | null) => unitLabel(localizedValue(id ? texts.resources[id]?.units : undefined, language, raw || ''), language),
    work: (id: string | null | undefined, raw: string) => localizedValue(id ? byWork[id]?.names : undefined, language, rawName(raw)),
  };
}
