import { database } from '@/database';
import { generateUUID } from '@/lib/uuid';

/**
 * Создание записи, которая заводится на устройстве и уедет на сервер при
 * следующей синхронизации.
 *
 * Собственный UUID обязателен: id генерируется офлайн и должен совпадать с
 * первичным ключом в Supabase, иначе push создаст дубликат. Прикладное поле
 * sync_status заполняется здесь — Watermelon про него не знает и сам не
 * выставит (та же схема, что у отчётов).
 */
export async function createLocalRecord<T = any>(
  table: string,
  apply: (record: any) => void
): Promise<T> {
  return database.write(async () => {
    const created = await database.collections.get(table).create((record: any) => {
      record._raw.id = generateUUID();
      record.recordSyncStatus = 'pending_sync';
      apply(record);
    });
    return created as unknown as T;
  });
}

/** Обновление записи с пометкой «требует отправки». */
export async function updateLocalRecord(
  record: any,
  apply: (record: any) => void
): Promise<void> {
  await database.write(async () => {
    await record.update((r: any) => {
      apply(r);
      r.recordSyncStatus = 'pending_sync';
    });
  });
}
