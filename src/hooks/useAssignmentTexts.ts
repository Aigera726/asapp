import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getActiveSupabaseUrl } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { indexAssignmentTexts, type AssignmentTextRow, type AssignmentTexts } from '@/lib/assignment-texts';

const EMPTY: AssignmentTexts = { works: {}, resources: {} };
const cacheWrites = new Map<string, Promise<void>>();
function cacheTexts(key: string, selection: string[], rows: AssignmentTextRow[]) {
  const previous = cacheWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    let saved: AssignmentTextRow[] = [];
    try { const parsed = JSON.parse(await AsyncStorage.getItem(key) || '[]'); if (Array.isArray(parsed)) saved = parsed; } catch { /* unavailable cache */ }
    const selected = new Set(selection);
    await AsyncStorage.setItem(key, JSON.stringify([...saved.filter(row => row && !selected.has(row.assignment_id)), ...rows]));
  }).catch(() => undefined).finally(() => { if (cacheWrites.get(key) === next) cacheWrites.delete(key); });
  cacheWrites.set(key, next);
  return next;
}

/** Display-only metadata; loading another language never rewrites a work or a report. */
export function useAssignmentTexts(ids: string[]) {
  const userId = useAuthStore(state => state.user?.id);
  const isDemoMode = useAuthStore(state => state.isDemoMode);
  const context = `${getActiveSupabaseUrl()}:${userId || ''}`;
  const selection = [...new Set(ids)].sort().join(',');
  const [snapshot, setSnapshot] = useState<{ context: string; texts: AssignmentTexts; unavailable: boolean } | null>(null);
  useEffect(() => {
    if (!userId || isDemoMode || !selection) return;
    let cancelled = false, liveDone = false, failed = false;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    const key = `ASAPP_ASSIGNMENT_TEXTS_V1:${context}`;
    void AsyncStorage.getItem(key).then(raw => {
      if (cancelled || liveDone || !raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) setSnapshot({ context, texts: indexAssignmentTexts(saved), unavailable: failed });
    }).catch(() => undefined);
    void (async () => {
      try {
        const assignmentIds = selection.split(','), rows: AssignmentTextRow[] = [];
        for (let i = 0; i < assignmentIds.length; i += 100) for (let offset = 0; ; offset += 500) {
          const result = await supabase.schema('mobile').from('v_assignment_localizations')
            .select('id,assignment_id,entity_id,entity_kind,names,units').in('assignment_id', assignmentIds.slice(i, i + 100))
            .order('id').range(offset, offset + 499).abortSignal(controller.signal);
          if (result.error) throw result.error;
          rows.push(...(result.data || []) as AssignmentTextRow[]);
          if ((result.data || []).length < 500) break;
          if (rows.length > 50000) throw Error('too_many_localization_rows');
        }
        liveDone = true;
        if (!cancelled) {
          setSnapshot({ context, texts: indexAssignmentTexts(rows), unavailable: false });
          await cacheTexts(key, assignmentIds, rows);
        }
      } catch {
        failed = true;
        if (!cancelled) setSnapshot(old => ({ context, texts: old?.context === context ? old.texts : EMPTY, unavailable: true }));
      } finally { clearTimeout(timer); }
    })();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [context, selection, userId, isDemoMode]);
  return snapshot?.context === context && !isDemoMode ? snapshot : { context, texts: EMPTY, unavailable: false };
}
