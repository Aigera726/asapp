import { synchronize } from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';
import { File } from 'expo-file-system';
import { database } from './index';
import { supabase } from '@/lib/supabase';
import { isDemoId, referencesDemoData } from '@/lib/demoData';

/**
 * Синхронизация WatermelonDB ↔ Supabase УСП.
 *
 * АРХИТЕКТУРА ПОСЛЕ ПЕРЕХОДА НА УСП
 *
 * Данные делятся надвое, и это деление проходит через весь файл:
 *
 *   1. Справочные — сметы, договоры, работы. Живут в схеме `erp`, ими владеет
 *      УСП. Мобилка их только ЧИТАЕТ, и только через представления схемы
 *      `mobile` (v_objects, v_assignments, v_assignment_resources): на самих
 *      таблицах erp включена RLS команды УСП, прямой select возвращает пусто.
 *      Представления сами сужают выдачу до договоров контрагента вошедшего
 *      пользователя, поэтому фильтровать на клиенте не нужно.
 *
 *   2. Собственные — отчёты, склад, техника, технадзор, закупки. Схема
 *      `mobile`, читаются и пишутся один в один.
 *
 * Одно представление наполняет несколько локальных таблиц: v_assignments
 * несёт в себе и работу, и договор, и контрагента, и строку сметы. Разбор
 * идёт в fanOut ниже — так экраны продолжают работать с привычными
 * таблицами, не зная, что источник стал витриной.
 */

const MOBILE_SCHEMA = 'mobile';

/** Секунда «сейчас» для строк, у которых на сервере нет отметки времени. */
const now = () => Date.now();

// ═══════════════════════════════════════════════════════════════════════════
// 1. ЧТЕНИЕ СПРАВОЧНЫХ ДАННЫХ ИЗ ВИТРИН
// ═══════════════════════════════════════════════════════════════════════════

type FanOut = {
  /** Представление в схеме mobile. */
  view: string;
  /** Локальные таблицы, которые оно наполняет. */
  targets: string[];
  /**
   * Разбирает строку витрины на записи локальных таблиц.
   * Возвращает объект «таблица → массив строк»; дубли снимаются по id.
   */
  split: (row: any) => Record<string, any[]>;
};

const FAN_OUTS: FanOut[] = [
  {
    // Объект стройки и проект, которому он принадлежит. Терминология
    // инвертирована относительно УСП: там project → project_objects, в
    // мобилке объект (ЖК) → проекты (корпуса). Сущности те же.
    view: 'v_objects',
    targets: ['construction_objects', 'projects'],
    split: (r) => ({
      construction_objects: r.project_id
        ? [{ id: r.project_id, name: r.project_name ?? 'Без названия', ext_id: r.project_code ?? null, updated_at: now() }]
        : [],
      projects: [
        {
          id: r.id,
          object_id: r.project_id ?? null,
          name: r.name ?? 'Без названия',
          ext_id: null,
          // Признаки поквартирного учёта в УСП не заводятся — мобилка
          // использует их только для собственной разбивки по этажам.
          is_apartment: false,
          floors_count: 0,
          sections_count: 0,
          updated_at: now(),
        },
      ],
    }),
  },
  {
    view: 'v_assignments',
    targets: ['contractors', 'contracts', 'estimate_works', 'work_assignments'],
    split: (r) => ({
      contractors: r.contractor_id
        ? [{ id: r.contractor_id, company_name: r.contractor_name ?? 'Контрагент', updated_at: now() }]
        : [],
      contracts: r.contract_id
        ? [
            {
              id: r.contract_id,
              // project_id локального договора указывает на локальный
              // projects, то есть на объект (erp.project_objects).
              // Колонка обязательная — пустая строка вместо null, иначе
              // санитайзер Watermelon подставит её молча.
              project_id: r.object_id ?? '',
              contractor_id: r.contractor_id ?? null,
              contract_number: r.contract_number ?? r.contract_name ?? null,
              ext_id: null,
              updated_at: now(),
            },
          ]
        : [],
      estimate_works: r.est_doc_work_id
        ? [
            {
              id: r.est_doc_work_id,
              version_id: '',
              name: r.work_name ?? 'Без названия',
              unit: r.work_unit ?? '',
              total_quantity: Number(r.estimate_volume ?? r.total_quantity ?? 0),
              ext_id: null,
              updated_at: now(),
            },
          ]
        : [],
      work_assignments: [
        {
          id: r.id,
          estimate_work_id: r.est_doc_work_id ?? null,
          // Пункт ГПР в договорах УСП не фигурирует: работа договора
          // ссылается на строку сметы, а не на график.
          wbs_item_id: null,
          resource_id: r.est_doc_resource_id ?? null,
          contract_id: r.contract_id ?? '',
          assignment_type: r.assignment_type ?? 'FIXED',
          assigned_quantity: Number(r.assigned_quantity ?? r.total_quantity ?? 0),
          status: r.status ?? 'PLANNED',
          updated_at: r.created_at ? new Date(r.created_at).getTime() : now(),
        },
      ],
    }),
  },
  {
    view: 'v_assignment_resources',
    targets: ['estimate_resources'],
    split: (r) => ({
      estimate_resources: [
        {
          id: r.id,
          name: r.resource_name ?? 'Ресурс',
          // unit_name — локализованное «Килограмм», unit_code — «KG».
          // Первое читаемее, второе всегда есть.
          unit: r.unit_name ?? r.unit_code ?? '',
          type_id: null,
          norm: r.norm === null || r.norm === undefined ? null : Number(r.norm),
          estimate_work_id: r.work_id ?? null,
          updated_at: now(),
        },
      ],
    }),
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 2. СОБСТВЕННЫЕ ТАБЛИЦЫ МОБИЛКИ
// ═══════════════════════════════════════════════════════════════════════════

type MobileTable = {
  table: string;
  limit: number;
  /**
   * Таблицы может не быть на сервере, если миграция sql/usp не применена.
   * Отсутствие — предупреждение, а не отказ всей синхронизации.
   */
  optional?: boolean;
};

/** Порядок важен: родители раньше детей, иначе ломаются внешние ключи. */
const MOBILE_TABLES: MobileTable[] = [
  { table: 'reports', limit: 10000 },
  { table: 'material_movements', limit: 50000 },
  { table: 'assets', limit: 20000 },
  { table: 'asset_movements', limit: 20000 },
  { table: 'inspections', limit: 20000 },
  { table: 'prescriptions', limit: 20000 },
  { table: 'deviations', limit: 20000 },
  { table: 'purchase_requests', limit: 10000 },
  { table: 'purchase_request_items', limit: 10000 },
  { table: 'purchase_orders', limit: 10000 },
  { table: 'purchase_order_items', limit: 10000 },
  { table: 'warehouse_receipts', limit: 10000 },
  { table: 'warehouse_receipt_items', limit: 10000 },
  { table: 'documents', limit: 10000 },
  { table: 'bpm_instances', limit: 10000 },
  { table: 'bpm_tasks', limit: 10000 },
  { table: 'document_signatures', limit: 10000 },
];

/**
 * Таблицы, которые мобилка отправляет на сервер. Справочные сюда не входят
 * принципиально: сметы и договоры ведёт УСП, а витрины доступны только на
 * чтение — попытка записи в них завершилась бы ошибкой представления.
 */
const PUSH_ORDER = MOBILE_TABLES.map((t) => t.table);

/** Локальные таблицы, которые наполняются витринами и никогда не отправляются. */
const READ_ONLY_TABLES = new Set(FAN_OUTS.flatMap((f) => f.targets));

/** Ошибка PostgREST «таблицы нет в схеме». */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42P01 — undefined_table в Postgres, PGRST205 — нет в кеше схемы PostgREST
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const m = (error.message ?? '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table');
}

/**
 * Текущая синхронизация. Экраны запускают её независимо (авто-синк на
 * дашборде, pull-to-refresh, кнопка на экране синхронизации), и параллельные
 * прогоны конфликтовали между собой. Одновременный вызов присоединяется к
 * уже идущему прогону.
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

async function runSync(_forceFullSync: boolean): Promise<void> {
  await synchronize({
    database,

    // ─────────────────────────────────────────────────────────────────────
    // PULL
    // ─────────────────────────────────────────────────────────────────────
    pullChanges: async () => {
      // Берём id из локальной сессии, а не через getUser(): тот делает
      // сетевой запрос и захватывает блокировку токена, из-за чего при
      // параллельных синхронизациях падало с «Lock ... was stolen».
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(`Не удалось получить сессию: ${sessionError.message}`);
      }
      if (!session?.user) {
        throw new Error('Пользователь не авторизован для синхронизации');
      }

      const client = supabase.schema(MOBILE_SCHEMA);

      // Витрины и собственные таблицы тянем одним пакетом запросов.
      // Инкремента нет намеренно: у представлений УСП нет надёжного
      // updated_at, а объёмы после фильтрации по договорам — сотни строк.
      const [viewRes, tableRes] = await Promise.all([
        Promise.all(FAN_OUTS.map((f) => client.from(f.view).select('*').limit(20000))),
        Promise.all(MOBILE_TABLES.map((t) => client.from(t.table).select('*').limit(t.limit))),
      ]);

      const errors: string[] = [];
      const skipped: string[] = [];

      // Пустые наборы для всех локальных таблиц: Watermelon требует ключ на
      // каждую коллекцию, иначе падает на неполном наборе изменений.
      const rows: Record<string, any[]> = {};
      for (const f of FAN_OUTS) for (const t of f.targets) rows[t] = [];
      for (const t of MOBILE_TABLES) rows[t.table] = [];
      // wbs_items источника в УСП не имеет: пункты графика к работам
      // договора не привязаны. Коллекция должна присутствовать пустой.
      rows['wbs_items'] = [];

      viewRes.forEach((res, i) => {
        const f = FAN_OUTS[i];
        if (res.error) {
          if (isMissingTable(res.error)) {
            skipped.push(f.view);
            return;
          }
          errors.push(`${f.view}: ${res.error.message}`);
          return;
        }
        for (const raw of res.data ?? []) {
          const parts = f.split(raw);
          for (const [table, list] of Object.entries(parts)) {
            rows[table].push(...list);
          }
        }
      });

      tableRes.forEach((res, i) => {
        const t = MOBILE_TABLES[i];
        if (res.error) {
          if (isMissingTable(res.error)) {
            skipped.push(t.table);
            return;
          }
          errors.push(`${t.table}: ${res.error.message}`);
          return;
        }
        rows[t.table].push(...(res.data ?? []));
      });

      if (skipped.length > 0) {
        console.warn(
          `[Sync] Нет на сервере: ${skipped.join(', ')}. ` +
            'Примените миграции из sql/usp и откройте схему mobile в PostgREST.'
        );
      }
      if (errors.length > 0) {
        throw new Error(`Ошибка загрузки данных: \n${errors.join('\n')}`);
      }

      const changes: Record<string, { created: any[]; updated: any[]; deleted: string[] }> = {};
      for (const [table, list] of Object.entries(rows)) {
        changes[table] = await mapToChanges(table, dedupeById(list));
      }

      console.log(
        '[Sync] Загружено:',
        Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]))
      );

      return { changes, timestamp: Date.now() };
    },

    // ─────────────────────────────────────────────────────────────────────
    // PUSH: только собственные таблицы мобилки
    // ─────────────────────────────────────────────────────────────────────
    pushChanges: async ({ changes }) => {
      const client = supabase.schema(MOBILE_SCHEMA);

      for (const table of PUSH_ORDER) {
        const raw = (changes as any)[table];
        if (!raw) continue;

        // Демо-данные живут только на устройстве: их id начинаются с
        // DEMO_ID_PREFIX. Иначе тестовые записи уехали бы в рабочую базу.
        //
        // Проверяем и внешние ключи: отчёт, оформленный в демо-режиме,
        // получает настоящий UUID, но ссылается на демо-задание. На сервере
        // такого задания нет, и push упирался в RLS — «new row violates
        // row-level security policy for table reports» — блокируя отправку
        // всех остальных записей.
        const sendable = (r: any) => !isDemoId(r.id) && !referencesDemoData(r);
        const created = (raw.created ?? []).filter(sendable);
        const updated = (raw.updated ?? []).filter(sendable);
        const deleted = (raw.deleted ?? []).filter((id: string) => !isDemoId(id));

        if (deleted.length > 0) {
          const { error } = await client.from(table).delete().in('id', deleted);
          if (error) {
            if (isMissingTable(error)) {
              console.warn(`[Sync] ${table} нет на сервере — удаление пропущено`);
            } else {
              throw new Error(`Ошибка удаления ${table}: ${error.message}`);
            }
          }
        }

        const all = [...created, ...updated];
        if (all.length === 0) continue;

        const records = [];
        for (const row of all) {
          const { _status, _changed, sync_status, updated_at, ...fields } = row;

          if (table === 'reports' && fields.photo_uri?.startsWith('file:')) {
            try {
              const remoteUrl = await uploadFileToSupabase(fields.photo_uri);
              // Локальный file:// путь на сервере бесполезен и в чужих
              // клиентах превратится в битую картинку — лучше пустое поле.
              fields.photo_uri = remoteUrl ?? null;
            } catch (uploadError) {
              console.warn(`[Sync] Фото не загружено для ${fields.id}:`, uploadError);
              fields.photo_uri = null;
            }
          }

          for (const key in fields) {
            const val = fields[key];
            if (typeof val === 'number' && key.endsWith('_at')) {
              fields[key] = new Date(val).toISOString();
            }
          }
          if (table === 'purchase_requests' && typeof fields.required_date === 'number') {
            fields.required_date = new Date(fields.required_date).toISOString().split('T')[0];
          }

          records.push(fields);
        }

        console.info(`[Sync] Отправка ${records.length} записей в ${table}`);
        const { error } = await client.from(table).upsert(records);
        if (error) {
          if (isMissingTable(error)) {
            console.warn(
              `[Sync] ${table} нет на сервере: ${records.length} записей остались локально. ` +
                'Примените sql/usp/01_mobile_schema.sql.'
            );
            continue;
          }
          throw new Error(`Ошибка отправки ${table}: ${error.message} (${error.hint || ''})`);
        }
      }
    },

    migrationsEnabledAtVersion: 1,
  });

  await markPushedRecordsAsSynced();
}

/** Строки из витрин повторяются: одна работа приносит один и тот же договор. */
function dedupeById(list: any[]): any[] {
  const seen = new Map<string, any>();
  for (const row of list) {
    if (row?.id && !seen.has(row.id)) seen.set(row.id, row);
  }
  return Array.from(seen.values());
}

/**
 * Разделяет пришедшие с сервера строки на created/updated: Watermelon считает
 * диагностической ошибкой попытку «создать» уже существующий id.
 */
async function mapToChanges(table: string, records: any[] | null) {
  if (!records || records.length === 0) {
    return { created: [], updated: [], deleted: [] as string[] };
  }

  const mapped = records.map((r) => {
    const row = { ...r };
    // Даты Supabase приходят строками, Watermelon хранит числа.
    for (const key in row) {
      const val = row[key];
      if (typeof val === 'string' && (key.endsWith('_at') || key === 'required_date')) {
        const t = new Date(val).getTime();
        if (!Number.isNaN(t)) row[key] = t;
      }
    }
    if (!row.updated_at) row.updated_at = Date.now();
    return row;
  });

  let existingIds: string[];
  try {
    existingIds = await database.get(table).query().fetchIds();
  } catch (err: any) {
    // На web (LokiJS) отсутствие локальной коллекции даёт невнятное
    // «Cannot read properties of null (reading 'chain')». Обычно это значит,
    // что локальная база осталась на старой версии схемы.
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
 * Прикладное поле sync_status Watermelon не знает и сам не обновляет. Без
 * этого шага отправленные записи навсегда оставались бы в списке «ожидают
 * отправки».
 */
async function markPushedRecordsAsSynced(): Promise<void> {
  // Модель отчёта назвала поле reportSyncStatus, остальные — recordSyncStatus.
  // Присваивать оба вслепую нельзя: у модели нет недекорированного свойства,
  // и запись ушла бы в пустоту вместо колонки.
  const FIELD: Record<string, string> = { reports: 'reportSyncStatus' };

  for (const { table } of MOBILE_TABLES) {
    try {
      const pending = await database.collections
        .get(table)
        .query(Q.where('sync_status', 'pending_sync'))
        .fetch();
      if (pending.length === 0) continue;

      const field = FIELD[table] ?? 'recordSyncStatus';
      await database.write(async () => {
        await database.batch(
          ...pending.map((rec) =>
            rec.prepareUpdate((r: any) => {
              r[field] = 'synced';
            })
          )
        );
      });
    } catch {
      // Часть таблиц (закупки, документы) колонки sync_status не имеет —
      // запрос по ней здесь ожидаемо падает и ничего не значит.
      continue;
    }
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
      .upload(filePath, bytes, { contentType: 'image/jpeg', upsert: true });

    if (error) {
      console.error('[Storage] Upload error:', error);
      return null;
    }

    return supabase.storage.from('report-photos').getPublicUrl(data.path).data.publicUrl;
  } catch (err) {
    console.error('[Storage] Exception during upload:', err);
    return null;
  }
}

/** Список таблиц для экрана диагностики. */
export const SYNCED_TABLES = [
  ...READ_ONLY_TABLES,
  ...MOBILE_TABLES.map((t) => t.table),
];
