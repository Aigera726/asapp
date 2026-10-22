import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { database } from '@/database';
import { syncPendingReports } from '@/database/sync';
import { useAuthStore } from '@/store/authStore';
import { useConfigStore } from '@/store/configStore';
import { createAutoSync, pendingReportForUser } from '@/lib/auto-sync';
import { deliveryFingerprint } from '@/lib/sync-delivery';

export default function AutoSync() {
  const userId = useAuthStore(s => s.session?.user.id);
  const demo = useAuthStore(s => s.isDemoMode);
  const ready = useAuthStore(s => s.profileLoaded && (s.isAdmin || !!s.contractorId));
  const server = useConfigStore(s => s.supabaseUrl), serverKey = useConfigStore(s => s.supabaseKey);
  useEffect(() => {
    if (!userId || demo || !ready) return;
    let pending = false, signature = '', active = AppState.currentState === 'active';
    const worker = createAutoSync({ pending: () => pending, active: () => active, sync: syncPendingReports });
    const reports = database.get('reports').query().observeWithColumns(['sync_status', 'reported_by', '_status', '_changed']).subscribe({
      next: rows => {
        const queued = rows.filter(row => pendingReportForUser(row._raw, userId));
        const next = JSON.stringify(queued.map(row => deliveryFingerprint(row._raw)).sort());
        // A successful metadata acknowledgement must not schedule another push.
        if (next !== signature) { signature = next; pending = queued.length > 0; worker.changed(); }
      },
      error: () => { pending = false; worker.changed(); },
    });
    const network = NetInfo.addEventListener(state => worker.connectivity(state));
    const lifecycle = AppState.addEventListener('change', state => {
      active = state === 'active';
      if (active) {
        // iOS may not deliver reachability events while suspended.
        void NetInfo.fetch().then(s => worker.connectivity(s)).catch(() => undefined);
        worker.foreground();
      } else worker.background();
    });
    return () => { worker.dispose(); reports.unsubscribe(); network(); lifecycle.remove(); };
  }, [userId, demo, ready, server, serverKey]);
  return null;
}
