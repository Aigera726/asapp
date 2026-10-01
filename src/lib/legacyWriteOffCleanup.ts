import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';

// Четыре старых автоматических списания, удалённые по запросу владельца.
// UUID сохраняем как tombstones: старый офлайн-кеш не должен вернуть их на сервер.
export const RETIRED_WRITE_OFF_IDS = new Set([
  '5843e3c9-2096-4865-bf87-6a1342ff0212',
  '391f6a30-ec69-41c4-be5b-4cd1b025862c',
  '12080f36-75a2-4170-a3fa-8012042ee716',
  '74b32be6-281a-4581-8f13-846751650af2',
]);

export async function removeRetiredWriteOffs(): Promise<void> {
  await database.write(async () => {
    const records = await database.get('material_movements')
      .query(Q.where('id', Q.oneOf([...RETIRED_WRITE_OFF_IDS]))).fetch();
    await database.batch(...records.map((r) => r.prepareDestroyPermanently()));
  });
}
