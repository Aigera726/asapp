import type { Database } from '@nozbe/watermelondb';
import { onlySyncMetadata } from '../lib/sync-delivery';

export class PendingLocalDataError extends Error {
  constructor(readonly count: number) { super('mobile_reset_pending'); this.name = 'PendingLocalDataError'; }
}

/** Check and remove within one writer so a report cannot appear between the guard and deletion. */
export async function clearDeliveredCache(database: Database, tables: readonly string[], writable: readonly string[]): Promise<void> {
  await database.write(async () => {
    let pending = 0;
    for (const table of writable) {
      const records = await database.get(table).query().fetch();
      pending += records.filter(record => {
        const raw = record._raw as any;
        return raw._status === 'created' || (raw._status === 'updated' && !onlySyncMetadata(raw))
          || raw.sync_status === 'pending_sync' || raw.sync_status === 'draft';
      }).length;
      pending += (await database.adapter.getDeletedRecords(table)).length;
    }
    if (pending) throw new PendingLocalDataError(pending);
    const removals = [];
    for (const table of tables) {
      for (const record of await database.get(table).query().fetch()) removals.push(record.prepareDestroyPermanently());
    }
    if (removals.length) await database.batch(...removals);
  });
}
