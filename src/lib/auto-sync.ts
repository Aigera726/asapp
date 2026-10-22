/** One foreground outbox worker; failed delivery never removes local reports. */
export type Connectivity = { isConnected: boolean | null; isInternetReachable: boolean | null };
type Timer = ReturnType<typeof setTimeout> | number;
type Dependencies = {
  pending: () => boolean;
  active: () => boolean;
  sync: () => Promise<void>;
  schedule?: (fn: () => void, delay: number) => Timer;
  cancel?: (timer: Timer) => void;
};
export function createAutoSync(deps: Dependencies) {
  const schedule = deps.schedule ?? setTimeout, cancel = deps.cancel ?? clearTimeout;
  const retries = [5000, 15000, 30000, 60000];
  let online = false, disposed = false, running = false, failures = 0, rerun = false;
  let timer: Timer | undefined;
  const eligible = () => !disposed && online && deps.active() && deps.pending();
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const queue = (delay = 700) => {
    if (!eligible() || running || timer !== undefined) return;
    timer = schedule(() => { timer = undefined; void run(); }, delay);
  };
  const run = async () => {
    if (!eligible() || running) return;
    running = true; rerun = false;
    let failed = false;
    try { await deps.sync(); failures = 0; }
    catch { failed = true; failures++; }
    finally { running = false; }
    if (!eligible()) return;
    if (!failed) { if (rerun) queue(); }
    else if (failures <= retries.length) queue(retries[failures - 1]);
  };
  return {
    connectivity(state: Connectivity) {
      const next = state.isConnected === true && state.isInternetReachable !== false;
      const restored = next && !online; online = next;
      if (!online) { clear(); return; }
      if (restored) { failures = 0; if (running) rerun = true; queue(); }
    },
    changed() { if (!deps.pending()) { clear(); failures = 0; return; } failures = 0; if (running) rerun = true; queue(); },
    foreground() { clear(); failures = 0; if (running) rerun = true; queue(); },
    background() { clear(); },
    dispose() { disposed = true; clear(); },
  };
}

export function pendingReportForUser(raw: Record<string, any>, userId: string): boolean {
  return raw.reported_by === userId && raw.sync_status !== 'draft'
    && (raw.sync_status === 'pending_sync' || raw._status === 'created'
      || (raw._status === 'updated' && String(raw._changed || '').split(',').some(k => k && k !== 'sync_status')));
}
