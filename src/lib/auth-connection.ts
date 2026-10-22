import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type SessionNotice = 'expired' | 'restoreFailed' | null;
// The SDK logs this handled sign-out as an error. Keep the console record for diagnostics;
// only replace its development overlay with the translated sign-in explanation.
export const HANDLED_SESSION_LOGS = [/Invalid Refresh Token: (Refresh Token Not Found|Already Used)/i];
type Lifecycle = { isActive(): boolean; subscribe(callback: (active: boolean) => void): () => void };
type Callbacks = { session(value: Session | null): void; notice(value: SessionNotice): void };

/** Attach immediately, before asynchronous SDK initialization can invalidate a cached session. */
export function observeSessionNotice(client: Pick<SupabaseClient, 'auth'>, notice: Callbacks['notice']) {
  return client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') notice('expired');
    else if (session) notice(null);
  }).data.subscription;
}

/** Restore explicitly before enabling refresh: expected expired credentials belong in the login UI, not LogBox. */
export function connectAuthSession(client: Pick<SupabaseClient, 'auth'>, callbacks: Callbacks, lifecycle: Lifecycle) {
  let disposed = false, initialized = false, subscription: { unsubscribe(): void } | undefined;
  const refresh = (active: boolean) => {
    if (!initialized || disposed) return;
    const action = active ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh();
    void action.catch(() => { if (!disposed) callbacks.notice('restoreFailed'); });
  };
  const stopLifecycle = lifecycle.subscribe(refresh);
  const ready = (async () => {
    try {
      const result = await client.auth.getSession();
      if (disposed) return;
      callbacks.session(result.data.session);
      const error = result.error;
      if (error) {
        const expired = /refresh_token_not_found|refresh_token_already_used|session_not_found/.test(error.code || '')
          || /invalid refresh token|refresh token.*not found/i.test(error.message);
        callbacks.notice(expired ? 'expired' : 'restoreFailed');
      } else if (result.data.session) callbacks.notice(null);
    } catch {
      if (disposed) return;
      callbacks.session(null); callbacks.notice('restoreFailed');
    }
    if (disposed) return;
    subscription = client.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      callbacks.session(session);
      if (session) callbacks.notice(null);
    }).data.subscription;
    initialized = true;
    refresh(lifecycle.isActive());
  })();
  return {
    ready,
    dispose() {
      disposed = true;
      stopLifecycle(); subscription?.unsubscribe();
      void client.auth.stopAutoRefresh().catch(() => {});
    },
  };
}
