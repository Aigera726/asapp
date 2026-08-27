import { synchronize } from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';
import { File } from 'expo-file-system';
import { database } from './index';
import { supabase } from '@/lib/supabase';
import { isDemoId } from '@/lib/demoData';

/**
 * Главная функция синхронизации WatermelonDB <-> Supabase
 *
 * АРХИТЕКТУРА:
 * 1. pullChanges: Читаем изменения из Supabase (через REST API) начиная с lastPulledAt
 * 2. pushChanges: Отправляем локальные изменения (created/updated/deleted) в Supabase
 * 3. Вызывается только при наличии сети (проверяется вызывающей стороной)
 */

type PullTable = {
  /** Имя таблицы: одинаковое в Supabase и в схеме WatermelonDB. */
  table: string;
  /**
   * true  — тянем только изменённое с прошлой синхронизации (updated_at > since);
   * false — таблица тянется целиком (справочники и таблицы без надёжного
   *         updated_at: инкремент по ним терял бы записи).
   */
  incremental: boolean;
  limit: number;
  /** Колонка, по которой строки фильтруются на текущего пользователя. */
  userColumn?: string;
  /**
   * Таблица может ещё не существовать на сервере (новый раздел, миграция не
   * применена). Отсутствие таблицы для такой записи — предупреждение, а не
   * отказ всей синхронизации: остальные разделы продолжают работать.
   */
  optional?: boolean;
};

/** Ошибка PostgREST «таблицы нет в схеме». */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42P01 — undefined_table в Postgres, PGRST205 — нет в кеше схемы PostgREST
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const m = (error.message ?? '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table');
}

/**
 * Порядок важен: родительские таблицы идут раньше дочерних, иначе Watermelon
 * упирается в нарушение внешних ключей при вставке.
 *
 * Список — единственное место, где перечислены таблицы синхронизации. Раньше
 * запросы и проверки ошибок жили отдельными списками, из-за чего ошибки по
 * четырём таблицам (purchase_order_items, warehouse_receipt_items,
 * bpm_instances, document_signatures) молча терялись, а синхронизация
 * заканчивалась «успехом» с неполными данными.
 */
const PULL_TABLES: PullTable[] = [
  { table: 'construction_objects', incremental: true, limit: 10000 },
  { table: 'contractors', incremental: false, limit: 10000 },
  { table: 'projects', incremental: true, limit: 10000 },
  { table: 'estimate_resources', incremental: false, limit: 50000 },
  { table: 'estimate_works', incremental: true, limit: 50000 },
  { table: 'wbs_items', incremental: false, limit: 50000 },
  { table: 'contracts', incremental: true, limit: 50000 },
  { table: 'work_assignments', incremental: true, limit: 50000 },
  { table: 'reports', incremental: true, limit: 10000 },
  { table: 'documents', incremental: true, limit: 10000, userColumn: 'signer_id' },
  { table: 'purchase_requests', incremental: false, limit: 10000 },
  { table: 'purchase_request_items', incremental: false, limit: 10000 },
  { table: 'purchase_orders', incremental: false, limit: 10000 },
  // Ниже четыре таблицы, у которых в Supabase НЕТ колонки updated_at.
  // Фильтр .gt('updated_at', …) возвращал по ним 400 (42703), но раньше эти
  // ошибки не проверялись и терялись — синхронизация «успешно» завершалась
  // без части данных. Пока колонки не добавлены (sql/add_updated_at_columns.sql),
  // тянем их целиком: таблицы небольшие.
  { table: 'purchase_order_items', incremental: false, limit: 10000 },
  { table: 'warehouse_receipts', incremental: false, limit: 10000 },
  { table: 'warehouse_receipt_items', incremental: false, limit: 10000 },
  { table: 'bpm_instances', incremental: false, limit: 10000 },
  { table: 'bpm_tasks', incremental: false, limit: 10000, userColumn: 'assignee_id' },
  { table: 'document_signatures', incremental: false, limit: 10000, userColumn: 'signer_id' },

  // Разделы «Ресурсы» и «Контроль». optional: true — пока не выполнен
  // sql/modules_resources_control.sql, эти таблицы на сервере отсутствуют,
  // и синхронизация остальных данных не должна из-за этого падать.
  { table: 'assets', incremental: false, limit: 20000, optional: true },
  { table: 'asset_movements', incremental: false, limit: 20000, optional: true },
  { table: 'material_movements', incremental: false, limit: 50000, optional: true },
  { table: 'inspections', incremental: false, limit: 20000, optional: true },
  { table: 'prescriptions', incremental: false, limit: 20000, optional: true },
  { table: 'deviations', incremental: false, limit: 20000, optional: true },
];

/** Таблицы, которых может не быть на сервере — используется и при отправке. */
const OPTIONAL_TABLES = new Set(
  PULL_TABLES.filter((t) => t.optional).map((t) => t.table)
);

/**
 * Колонки, названия которых расходятся между Supabase и локальной схемой:
 * ключ — имя на сервере, значение — локальное. Watermelon отбрасывает поля,
 * которых нет в схеме, поэтому без переименования норма расхода приезжала как
 * пустая: на сервере она norm_per_unit, а локально — norm.
 */
const COLUMN_ALIASES: Record<string, Record<string, string>> = {
  estimate_resources: { norm_per_unit: 'norm' },
};

/** Переименование серверных колонок в локальные (pull). */
function toLocalColumns(table: string, row: Record<string, any>): Record<string, any> {
  const aliases = COLUMN_ALIASES[table];
  if (!aliases) return row;
  const out: Record<string, any> = {};
  for (const key in row) {
    out[aliases[key] ?? key] = row[key];
  }
  return out;
}

/** Обратное переименование перед отправкой (push). */
function toServerColumns(table: string, row: Record<string, any>): Record<string, any> {
  const aliases = COLUMN_ALIASES[table];
  if (!aliases) return row;
  const reverse = Object.fromEntries(Object.entries(aliases).map(([s, l]) => [l, s]));
  const out: Record<string, any> = {};
  for (const key in row) {
    out[reverse[key] ?? key] = row[key];
  }
  return out;
}

/** Порядок отправки на сервер — тот же принцип «родители раньше детей». */
const PUSH_ORDER = [
  'contractors',
  'construction_objects',
  'projects',
  'estimate_resources',
  'estimate_works',
  'contracts',
  'wbs_items',
  'work_assignments',
  'reports',
  'documents',
  'purchase_requests',
  'purchase_request_items',
  'purchase_orders',
  'purchase_order_items',
  'warehouse_receipts',
  'warehouse_receipt_items',
  'bpm_instances',
  'bpm_tasks',
  'document_signatures',
  'assets',
  'asset_movements',
  'material_movements',
  'inspections',
  'prescriptions',
  'deviations',
];

/**
 * Текущая синхронизация. Экраны запускают её независимо (авто-синк на
 * дашборде, pull-to-refresh, кнопка на экране синхронизации), и параллельные
 * прогоны конфликтовали между собой: 19 запросов × N, гонка за блокировку
 * токена и повторная запись одних и тех же изменений. Одновременный вызов
 * теперь присоединяется к уже идущему прогону.
 */
let inFlight: Promise<void> | null = null;

export function syncDatabase(forceFullSync: boolean = false): Promise<void> {
  if (inFlight) {
    console.info('[Sync] Синхронизация уже идёт — присоединяемся к текущему прогону');
    return inFlight;
  }

  inFlight = runSync(forceFullSync).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function runSync(forceFullSync: boolean): Promise<void> {
  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt }) => {
      const since = (lastPulledAt && !forceFullSync)
        ? new Date(lastPulledAt).toISOString()
        : '1970-01-01T00:00:00Z';

      console.info(`[Sync] Pulling changes since: ${since}${forceFullSync ? ' (FORCE FULL)' : ''}`);

      // Берём id из локальной сессии, а не через getUser(): тот делает
      // сетевой запрос к /auth/v1/user и захватывает блокировку токена, из-за
      // чего при параллельных синхронизациях падало с
      // «Lock ... was released because another request stole it».
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(`Не удалось получить сессию: ${sessionError.message}`);
      }
      const user = session?.user;
      if (!user) {
        throw new Error('Пользователь не авторизован для синхронизации');
      }

      const responses = await Promise.all(
        PULL_TABLES.map((t) => {
          let query = supabase.from(t.table).select('*').limit(t.limit);
          if (t.incremental) query = query.gt('updated_at', since);
          if (t.userColumn) query = query.eq(t.userColumn, user.id);
          return query;
        })
      );

      // Ошибки собираем по ВСЕМ таблицам: частично загруженная база хуже
      // явного отказа — пользователь работал бы с неполными данными.
      // Исключение — необязательные таблицы, которых ещё нет на сервере.
      const errors: string[] = [];
      const skipped: string[] = [];

      responses.forEach((res, i) => {
        const t = PULL_TABLES[i];
        if (!res.error) return;
        if (t.optional && isMissingTable(res.error)) {
          skipped.push(t.table);
          return;
        }
        errors.push(`${t.table}: ${res.error.message}`);
      });

      if (skipped.length > 0) {
        console.warn(
          `[Sync] Таблиц нет на сервере, раздел работает только локально: ${skipped.join(', ')}. ` +
            'Выполните sql/modules_resources_control.sql в Supabase.'
        );
      }

      if (errors.length > 0) {
        throw new Error(`Ошибка загрузки данных: \n${errors.join('\n')}`);
      }

      const counts: Record<string, number> = {};
      PULL_TABLES.forEach((t, i) => {
        counts[t.table] = responses[i].data?.length ?? 0;
      });
      console.log('[Sync] Fetched counts:', counts);

      const skippedSet = new Set(skipped);
      const changes: Record<string, { created: any[]; updated: any[]; deleted: string[] }> = {};
      for (let i = 0; i < PULL_TABLES.length; i++) {
        const t = PULL_TABLES[i];
        // Пропущенной таблице отдаём пустой набор: Watermelon требует ключ
        // для каждой коллекции, иначе падает на неполном наборе изменений.
        changes[t.table] = skippedSet.has(t.table)
          ? { created: [], updated: [], deleted: [] }
          : await mapToChanges(t.table, responses[i].data);
      }

      return { changes, timestamp: Date.now() };
    },

    // ─────────────────────────────────────────────────────────────────────
    // PUSH: Отправляем локальные изменения на сервер
    // ─────────────────────────────────────────────────────────────────────
    pushChanges: async ({ changes }) => {
      const pushSummary = Object.entries(changes as any).reduce((acc, [table, c]: [string, any]) => {
        const total = (c.created?.length ?? 0) + (c.updated?.length ?? 0) + (c.deleted?.length ?? 0);
        if (total > 0) acc[table] = total;
        return acc;
      }, {} as Record<string, number>);
      // Раньше сюда писался весь payload целиком: гигантские логи с
      // персональными данными и координатами. Достаточно счётчиков.
      console.info('[Sync] Changes to push:', pushSummary);

      for (const table of PUSH_ORDER) {
        if (!(changes as any)[table]) continue;
        const raw = (changes as any)[table];

        // Демо-данные живут только на устройстве: их id начинаются с
        // DEMO_ID_PREFIX. Иначе тестовые записи уехали бы в рабочую базу.
        const created = (raw.created ?? []).filter((r: any) => !isDemoId(r.id));
        const updated = (raw.updated ?? []).filter((r: any) => !isDemoId(r.id));
        const deleted = (raw.deleted ?? []).filter((id: string) => !isDemoId(id));

        // Сначала удаляем записи на сервере
        if (deleted && deleted.length > 0) {
          console.info(`[Sync] Deleting ${deleted.length} records from ${table}...`);
          const { error } = await supabase.from(table).delete().in('id', deleted);
          if (error) {
            if (OPTIONAL_TABLES.has(table) && isMissingTable(error)) {
              console.warn(`[Sync] ${table} нет на сервере — удаление пропущено`);
            } else {
              console.error(`[Sync] Delete failed for ${table}:`, error);
              throw new Error(`Ошибка удаления ${table}: ${error.message} (${error.hint || ''})`);
            }
          }
        }

        const allChanges = [...created, ...updated];
        if (allChanges.length === 0) continue;

        console.info(`[Sync] Pushing ${allChanges.length} records to ${table}...`);

        const recordsToPush = [];
        for (const row of allChanges) {
          // Копируем объект параметров
          const { _status, _changed, sync_status, updated_at, ...serverFields } = row;

          // Специальная обработка для фотографий в отчетах
          if (table === 'reports' && serverFields.photo_uri && serverFields.photo_uri.startsWith('file:')) {
            try {
              console.info(`[Sync] Uploading photo for report ${serverFields.id}...`);
              const remoteUrl = await uploadFileToSupabase(serverFields.photo_uri);
              if (remoteUrl) {
                serverFields.photo_uri = remoteUrl;
              } else {
                // Локальный file:// путь на сервере бесполезен и в чужих
                // клиентах превратится в битую картинку — лучше пустое поле.
                serverFields.photo_uri = null;
              }
            } catch (uploadError) {
              console.warn(`[Sync] Photo upload failed for ${serverFields.id}, skipping photo:`, uploadError);
              serverFields.photo_uri = null;
            }
          }

          // Обеспечиваем непустую дату для required_date
          if (table === 'purchase_requests' && !serverFields.required_date) {
            serverFields.required_date = Date.now();
          }

          // Преобразование типов полей дат для совместимости с Supabase PostgreSQL
          for (const key in serverFields) {
            const val = serverFields[key];
            if (typeof val === 'number') {
              if (key === 'required_date') {
                serverFields[key] = new Date(val).toISOString().split('T')[0];
              } else if (key.endsWith('_at')) {
                serverFields[key] = new Date(val).toISOString();
              }
            }
          }

          recordsToPush.push(toServerColumns(table, serverFields));
        }

        const { error } = await supabase.from(table).upsert(recordsToPush);

        if (error) {
          // Раздел может работать локально, пока миграция не применена —
          // отсутствие таблицы не должно ронять отправку остальных данных.
          if (OPTIONAL_TABLES.has(table) && isMissingTable(error)) {
            console.warn(
              `[Sync] ${table} нет на сервере: ${recordsToPush.length} записей остались локально. ` +
                'Выполните sql/modules_resources_control.sql.'
            );
            continue;
          }
          console.error(`[Sync] Push failed for ${table}:`, error);
          throw new Error(`Ошибка отправки ${table}: ${error.message} (${error.hint || ''})`);
        }
        console.log(`[Sync] Successfully pushed ${table}`);
      }
    },

    migrationsEnabledAtVersion: 1,
  });

  await markPushedReportsAsSynced();
}

/**
 * Разделяет пришедшие с сервера строки на created/updated: Watermelon считает
 * диагностической ошибкой попытку «создать» уже существующий id.
 */
async function mapToChanges(table: string, records: any[] | null) {
  if (!records) return { created: [], updated: [], deleted: [] };

  const mapped = records.map((r) => {
    const newR = toLocalColumns(table, r);
    // Преобразуем строковые даты из Supabase обратно в числа для WatermelonDB
    for (const key in newR) {
      const val = newR[key];
      if (typeof val === 'string' && (key.endsWith('_at') || key === 'required_date')) {
        newR[key] = new Date(val).getTime();
      }
    }
    if (!newR.updated_at) newR.updated_at = Date.now();
    return newR;
  });

  // Получаем все существующие ID в этой таблице локально
  let existingIds: string[];
  try {
    existingIds = await database.get(table).query().fetchIds();
  } catch (err: any) {
    // На web (LokiJS) отсутствие локальной коллекции даёт невнятное
    // «Cannot read properties of null (reading 'chain')». Обычно это значит,
    // что локальная база осталась на старой версии схемы и миграция не
    // создала новые таблицы. Говорим это прямо и подсказываем действие.
    if (String(err?.message ?? '').includes('chain')) {
      throw new Error(
        `Локальная база не содержит таблицу «${table}» — она осталась на старой ` +
          'версии схемы. Откройте Ещё → Синхронизация → «Сбросить БД и перезагрузить».'
      );
    }
    throw err;
  }
  const idSet = new Set(existingIds);

  return {
    created: mapped.filter((r) => !idSet.has(r.id)),
    updated: mapped.filter((r) => idSet.has(r.id)),
    deleted: [] as string[],
  };
}

/**
 * Собственное поле sync_status у отчётов — прикладное, Watermelon про него не
 * знает и сам не обновляет. Поэтому после успешного push помечаем отправленные
 * отчёты как synced, иначе они навсегда остались бы в списке «ожидают отправки».
 */
async function markPushedReportsAsSynced(): Promise<void> {
  try {
    const pendingReports = await database.collections
      .get('reports')
      .query(Q.where('sync_status', 'pending_sync'))
      .fetch();

    if (pendingReports.length === 0) return;

    console.log(`[Sync] Post-sync: updating ${pendingReports.length} reports to synced status`);
    await database.write(async () => {
      await database.batch(
        ...pendingReports.map((report) =>
          report.prepareUpdate((r) => {
            (r as any).reportSyncStatus = 'synced';
          })
        )
      );
    });
  } catch (err) {
    console.error('[Sync] Post-sync cleanup failed:', err);
  }
}

/**
 * Загружает локальный файл в Supabase Storage и возвращает публичную ссылку.
 *
 * Читаем файл через expo-file-system, а не `fetch(uri).blob()`: в React Native
 * Blob из локального файла приходит без данных, и в бакет улетал файл нулевого
 * размера — фотоподтверждения работ фактически терялись.
 */
async function uploadFileToSupabase(localUri: string): Promise<string | null> {
  try {
    const originalName = localUri.split('/').pop() || 'photo.jpg';
    const filePath = `reports/${Date.now()}-${originalName}`;

    const bytes = await new File(localUri).bytes();
    if (bytes.byteLength === 0) {
      console.error('[Storage] Локальный файл пуст:', localUri);
      return null;
    }

    const { data, error } = await supabase.storage
      .from('report-photos')
      .upload(filePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[Storage] Upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('report-photos')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  } catch (err) {
    console.error('[Storage] Exception during upload:', err);
    return null;
  }
}
