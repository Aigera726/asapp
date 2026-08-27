import { database } from '@/database';

/**
 * Демонстрационные данные для проверки интерфейса без сервера.
 *
 * ГЛАВНОЕ ОГРАНИЧЕНИЕ: такие записи не должны попасть в рабочую базу.
 * Любая созданная локально запись по умолчанию уезжает на сервер при
 * следующей синхронизации, поэтому у демо-записей id начинается с
 * DEMO_ID_PREFIX, а pushChanges такие id отбрасывает (см. isDemoId в sync.ts).
 * Префикс шестнадцатеричный, чтобы id оставался корректным UUID.
 */
export const DEMO_ID_PREFIX = 'deadbeef-';

export function isDemoId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(DEMO_ID_PREFIX);
}

let counter = 0;

/** Детерминированный id демо-записи: без Math.random, чтобы не плодить копии. */
function demoId(): string {
  counter += 1;
  const tail = counter.toString(16).padStart(12, '0');
  return `${DEMO_ID_PREFIX}0000-4000-8000-${tail}`;
}

/** Таблицы, которые заполняет и очищает демо-режим. */
const DEMO_TABLES = [
  'construction_objects',
  'projects',
  'contractors',
  'contracts',
  'work_assignments',
  'estimate_works',
  'estimate_resources',
  'assets',
  'asset_movements',
  'material_movements',
  'inspections',
  'prescriptions',
  'deviations',
];

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day);
const ahead = (days: number) => new Date(Date.now() + days * day);

/**
 * Заполняет базу связным набором данных: два объекта, техника и инструменты,
 * движения склада, проверки, предписания (включая просроченное) и отклонения.
 */
export async function seedDemoData(): Promise<void> {
  counter = 0;
  await clearDemoData();

  await database.write(async () => {
    const create = async (table: string, apply: (r: any) => void) => {
      return database.collections.get(table).create((r: any) => {
        r._raw.id = demoId();
        apply(r);
      });
    };

    // ── Объекты и проекты ────────────────────────────────────────────────────
    const object = await create('construction_objects', (r) => {
      r.name = 'ЖК «Каспий Парк» (демо)';
    });

    const project1 = await create('projects', (r) => {
      r.objectId = object.id;
      r.name = 'Блок А — надземная часть (демо)';
      r.isApartment = true;
      r.floorsCount = 16;
      r.sectionsCount = 2;
    });

    const project2 = await create('projects', (r) => {
      r.objectId = object.id;
      r.name = 'Блок Б — фундамент (демо)';
      r.isApartment = false;
      r.floorsCount = 0;
      r.sectionsCount = 1;
    });

    const contractor = await create('contractors', (r) => {
      r.companyName = 'ТОО «СтройМонтаж» (демо)';
    });

    const contract = await create('contracts', (r) => {
      r.projectId = project1.id;
      r.contractorId = contractor.id;
      r.contractNumber = 'Д-2026/14';
    });

    // ── Работы ───────────────────────────────────────────────────────────────
    const resource = await create('estimate_resources', (r) => {
      r.name = 'Бетон B25 W6 F150';
      r.unit = 'м³';
    });

    await create('work_assignments', (r) => {
      r.contractId = contract.id;
      r.resourceId = resource.id;
      r.assignmentType = 'FIXED';
      r.assignedQuantity = 420;
      r.status = 'IN_PROGRESS';
    });

    await create('work_assignments', (r) => {
      r.contractId = contract.id;
      r.assignmentType = 'OPEN';
      r.assignedQuantity = 1200;
      r.status = 'PLANNED';
    });

    // Строка сметы с нормами расхода: по ней отчёт списывает материалы.
    const work = await create('estimate_works', (r) => {
      r.versionId = demoId();
      r.name = 'Устройство монолитной плиты перекрытия (демо)';
      r.unit = 'м³';
      r.totalQuantity = 420;
    });

    // Нормы на 1 м³ бетонирования.
    for (const [name, unit, norm] of [
      ['Бетон B25 W6 F150', 'м³', 1.02],
      ['Арматура A500C ⌀12', 'т', 0.085],
      ['Фанера ламинированная 18 мм', 'м²', 0.35],
    ] as [string, string, number][]) {
      await create('estimate_resources', (r) => {
        r.estimateWorkId = work.id;
        r.name = name;
        r.unit = unit;
        r.norm = norm;
      });
    }

    await create('work_assignments', (r) => {
      r.contractId = contract.id;
      r.estimateWorkId = work.id;
      r.assignmentType = 'FIXED';
      r.assignedQuantity = 420;
      r.status = 'IN_PROGRESS';
    });

    // ── Материалы: журнал даёт остатки ───────────────────────────────────────
    const movements: [string, string, string, number, number, string | null][] = [
      // название, ед., тип, количество, дней назад, комментарий
      ['Бетон B25 W6 F150', 'м³', 'RECEIPT', 180, 6, 'Накладная № 3391, миксеры 6 шт'],
      ['Бетон B25 W6 F150', 'м³', 'ISSUE', 120, 5, 'Плита перекрытия, ось 1-4'],
      ['Бетон B25 W6 F150', 'м³', 'ISSUE', 45, 2, 'Плита перекрытия, ось 4-7'],
      ['Арматура A500C ⌀12', 'т', 'RECEIPT', 24.5, 8, 'Накладная № 3288'],
      ['Арматура A500C ⌀12', 'т', 'ISSUE', 11.2, 4, 'Каркасы колонн'],
      ['Арматура A500C ⌀12', 'т', 'WRITE_OFF', 0.4, 3, 'Обрезки, актирована потеря'],
      ['Кирпич керамический М150', 'тыс. шт', 'RECEIPT', 42, 12, null],
      ['Кирпич керамический М150', 'тыс. шт', 'ISSUE', 18, 7, 'Перегородки 3-5 этаж'],
      ['Утеплитель минвата 100мм', 'м²', 'ISSUE', 350, 1, 'Списано без прихода — проверить'],
    ];

    for (const [name, unit, type, qty, daysAgo, comment] of movements) {
      await create('material_movements', (r) => {
        r.projectId = project1.id;
        r.resourceId = null;
        r.materialName = name;
        r.unit = unit;
        r.type = type;
        r.quantity = qty;
        r.comment = comment;
        r.occurredAt = ago(daysAgo);
        r.recordSyncStatus = 'synced';
      });
    }

    // ── Техника, оборудование, инструменты ──────────────────────────────────
    const excavator = await create('assets', (r) => {
      r.kind = 'MACHINERY';
      r.name = 'Экскаватор гусеничный';
      r.model = 'Caterpillar 320D';
      r.inventoryNumber = 'ТХ-0114';
      r.serialNumber = 'CAT0320DK2B';
      r.status = 'IN_USE';
      r.projectId = project2.id;
      r.holderName = 'Ожанов Р.А.';
      r.totalHours = 1284.5;
    });

    await create('asset_movements', (r) => {
      r.assetId = excavator.id;
      r.type = 'SHIFT';
      r.projectId = project2.id;
      r.toHolder = 'Ожанов Р.А.';
      r.hours = 9;
      r.comment = 'Разработка котлована, захватка 2';
      r.occurredAt = ago(1);
      r.recordSyncStatus = 'synced';
    });

    await create('asset_movements', (r) => {
      r.assetId = excavator.id;
      r.type = 'SHIFT';
      r.projectId = project2.id;
      r.toHolder = 'Ожанов Р.А.';
      r.hours = 8;
      r.occurredAt = ago(2);
      r.recordSyncStatus = 'synced';
    });

    const crane = await create('assets', (r) => {
      r.kind = 'MACHINERY';
      r.name = 'Башенный кран';
      r.model = 'Potain MDT 219';
      r.inventoryNumber = 'ТХ-0032';
      r.status = 'REPAIR';
      r.projectId = project1.id;
      r.totalHours = 3410;
      r.nextServiceAt = ahead(9);
    });

    await create('asset_movements', (r) => {
      r.assetId = crane.id;
      r.type = 'SERVICE';
      r.projectId = project1.id;
      r.comment = 'Замена тормозной муфты механизма подъёма';
      r.occurredAt = ago(3);
      r.recordSyncStatus = 'synced';
    });

    await create('assets', (r) => {
      r.kind = 'EQUIPMENT';
      r.name = 'Станция бетононасосная';
      r.model = 'Putzmeister BSA 1409';
      r.inventoryNumber = 'ОБ-0207';
      r.status = 'IDLE';
      r.projectId = project1.id;
    });

    await create('assets', (r) => {
      r.kind = 'EQUIPMENT';
      r.name = 'Сварочный инвертор';
      r.model = 'Kemppi MinarcMig 220';
      r.inventoryNumber = 'ОБ-0341';
      r.status = 'IN_USE';
      r.projectId = project1.id;
      r.holderName = 'Арман Б.';
    });

    const tool = await create('assets', (r) => {
      r.kind = 'TOOL';
      r.name = 'Перфоратор SDS-Max';
      r.model = 'Bosch GBH 8-45 D';
      r.inventoryNumber = 'ИН-1180';
      r.status = 'IN_USE';
      r.projectId = project1.id;
      r.holderName = 'Арман Б.';
    });

    await create('asset_movements', (r) => {
      r.assetId = tool.id;
      r.type = 'ISSUE';
      r.projectId = project1.id;
      r.toHolder = 'Арман Б.';
      r.comment = 'Выдан под роспись, бригада 3';
      r.occurredAt = ago(4);
      r.recordSyncStatus = 'synced';
    });

    await create('assets', (r) => {
      r.kind = 'TOOL';
      r.name = 'Нивелир оптический';
      r.model = 'Bosch GOL 26 D';
      r.inventoryNumber = 'ИН-0904';
      r.status = 'IDLE';
      r.projectId = project1.id;
    });

    await create('assets', (r) => {
      r.kind = 'TOOL';
      r.name = 'Виброрейка';
      r.model = 'Wacker Neuson P35A';
      r.inventoryNumber = 'ИН-0755';
      r.status = 'LOST';
      r.projectId = project2.id;
      r.holderName = 'Не установлен';
    });

    // ── Технадзор: проверки ─────────────────────────────────────────────────
    const failedInspection = await create('inspections', (r) => {
      r.projectId = project1.id;
      r.kind = 'HIDDEN_WORK';
      r.result = 'FAIL';
      r.title = 'Армирование плиты перекрытия, ось 4-7';
      r.description =
        'Защитный слой бетона 12–15 мм при проектном 30 мм. Фиксаторы установлены не по всей площади.';
      r.inspectorName = 'Кашкинбаева А.А.';
      r.geoLat = 40.3925;
      r.geoLon = 49.8674;
      r.inspectedAt = ago(3);
      r.recordSyncStatus = 'synced';
    });

    await create('inspections', (r) => {
      r.projectId = project1.id;
      r.kind = 'INCOMING';
      r.result = 'PASS';
      r.title = 'Входной контроль арматуры A500C ⌀12';
      r.description = 'Сертификат соответствия предъявлен, маркировка совпадает.';
      r.inspectorName = 'Кашкинбаева А.А.';
      r.inspectedAt = ago(8);
      r.recordSyncStatus = 'synced';
    });

    await create('inspections', (r) => {
      r.projectId = project2.id;
      r.kind = 'OPERATIONAL';
      r.result = 'PASS_WITH_REMARKS';
      r.title = 'Устройство бетонной подготовки';
      r.description = 'Локальные наплывы, требуется зачистка перед гидроизоляцией.';
      r.inspectorName = 'Кашкинбаева А.А.';
      r.inspectedAt = ago(1);
      r.recordSyncStatus = 'synced';
    });

    // ── Технадзор: предписания ──────────────────────────────────────────────
    await create('prescriptions', (r) => {
      r.number = 'ПР-2026-0041';
      r.projectId = project1.id;
      r.inspectionId = failedInspection.id;
      r.contractorId = contractor.id;
      r.issuedByName = 'Кашкинбаева А.А.';
      r.severity = 'CRITICAL';
      r.status = 'OPEN';
      r.title = 'Недостаточный защитный слой бетона';
      r.description = 'Ось 4-7, плита перекрытия 5 этажа. СП 63.13330 п. 10.3.2.';
      r.requirement =
        'Обеспечить защитный слой 30 мм: установить фиксаторы с шагом не более 600 мм по всей площади.';
      r.dueAt = ago(2); // просрочено — попадёт в предупреждение на главной
      r.issuedAt = ago(3);
      r.recordSyncStatus = 'synced';
    });

    await create('prescriptions', (r) => {
      r.number = 'ПР-2026-0042';
      r.projectId = project2.id;
      r.contractorId = contractor.id;
      r.issuedByName = 'Кашкинбаева А.А.';
      r.severity = 'HIGH';
      r.status = 'IN_PROGRESS';
      r.title = 'Отсутствует ограждение котлована';
      r.requirement = 'Установить сигнальное ограждение по периметру, высота не менее 1,2 м.';
      r.dueAt = ahead(1);
      r.issuedAt = ago(1);
      r.recordSyncStatus = 'synced';
    });

    await create('prescriptions', (r) => {
      r.number = 'ПР-2026-0039';
      r.projectId = project1.id;
      r.contractorId = contractor.id;
      r.issuedByName = 'Ожанов Р.А.';
      r.severity = 'MEDIUM';
      r.status = 'SUBMITTED';
      r.title = 'Складирование материалов в проходе';
      r.requirement = 'Освободить эвакуационный проход, перенести поддоны на площадку складирования.';
      r.resolutionComment = 'Поддоны перенесены на площадку С-2, проход освобождён.';
      r.dueAt = ahead(3);
      r.resolvedAt = ago(1);
      r.issuedAt = ago(5);
      r.recordSyncStatus = 'synced';
    });

    await create('prescriptions', (r) => {
      r.number = 'ПР-2026-0035';
      r.projectId = project1.id;
      r.contractorId = contractor.id;
      r.issuedByName = 'Кашкинбаева А.А.';
      r.severity = 'LOW';
      r.status = 'VERIFIED';
      r.title = 'Не заполнен журнал бетонных работ';
      r.requirement = 'Заполнить журнал за период с 01.08.';
      r.resolutionComment = 'Журнал заполнен, предъявлен.';
      r.dueAt = ago(6);
      r.resolvedAt = ago(7);
      r.closedAt = ago(6);
      r.issuedAt = ago(10);
      r.recordSyncStatus = 'synced';
    });

    // ── Технадзор: отклонения ───────────────────────────────────────────────
    await create('deviations', (r) => {
      r.number = 'ТО-2026-0008';
      r.projectId = project1.id;
      r.category = 'MATERIAL';
      r.status = 'PENDING';
      r.title = 'Замена арматуры A500C ⌀12 на ⌀14 с изменением шага';
      r.reason = 'Дефицит ⌀12 у поставщика, срок поставки 4 недели, простой по графику.';
      r.proposedSolution =
        'Шаг стержней увеличить с 200 до 250 мм при сохранении площади сечения на метр.';
      r.requestedByName = 'Ожанов Р.А.';
      r.requestedAt = ago(2);
      r.recordSyncStatus = 'synced';
    });

    await create('deviations', (r) => {
      r.number = 'ТО-2026-0007';
      r.projectId = project2.id;
      r.category = 'TECHNOLOGY';
      r.status = 'APPROVED';
      r.title = 'Бетонирование фундаментной плиты в две захватки';
      r.reason = 'Производительность бетонного узла не позволяет уложить объём за одну смену.';
      r.proposedSolution = 'Рабочий шов по оси 5 с установкой гидрошпонки.';
      r.decisionComment = 'Согласовано при условии предъявления шва до бетонирования второй захватки.';
      r.requestedByName = 'Ожанов Р.А.';
      r.decidedAt = ago(4);
      r.requestedAt = ago(6);
      r.recordSyncStatus = 'synced';
    });

    await create('deviations', (r) => {
      r.number = 'ТО-2026-0005';
      r.projectId = project1.id;
      r.category = 'GEOMETRY';
      r.status = 'REJECTED';
      r.title = 'Отклонение колонн от вертикали 18 мм на этаж';
      r.reason = 'Фактическое положение по результатам исполнительной съёмки.';
      r.decisionComment = 'Отклонение превышает допуск СП 70.13330. Требуется исправление.';
      r.requestedByName = 'Арман Б.';
      r.decidedAt = ago(8);
      r.requestedAt = ago(9);
      r.recordSyncStatus = 'synced';
    });
  });
}

/**
 * Записи, заведённые пользователем поверх демо-данных.
 *
 * Отчёт, оформленный в демо-режиме, получает настоящий UUID, но ссылается на
 * демо-задание. На сервере такого задания нет, и push упирается в RLS:
 * «new row violates row-level security policy for table reports». Такие
 * записи бессмысленны вне демо-режима, поэтому чистятся вместе с ним.
 */
const DERIVED_TABLES = [
  'reports',
  'material_movements',
  'asset_movements',
  'inspections',
  'prescriptions',
  'deviations',
];

/** Ссылается ли запись на демо-данные хотя бы одним внешним ключом. */
export function referencesDemoData(row: Record<string, any>): boolean {
  return Object.entries(row).some(
    ([key, value]) => key.endsWith('_id') && isDemoId(value as string)
  );
}

/** Удаляет только демо-записи, рабочие данные не трогает. */
export async function clearDemoData(): Promise<void> {
  await database.write(async () => {
    for (const table of DEMO_TABLES) {
      let records: any[];
      try {
        records = await database.collections.get(table).query().fetch();
      } catch (e) {
        // Раздел ещё не создан локально — нечего чистить
        continue;
      }
      const demo = records.filter((r) => isDemoId(r.id));
      if (demo.length === 0) continue;
      await database.batch(...demo.map((r) => r.prepareDestroyPermanently()));
    }

    for (const table of DERIVED_TABLES) {
      let records: any[];
      try {
        records = await database.collections.get(table).query().fetch();
      } catch (e) {
        continue;
      }
      const orphans = records.filter((r) => referencesDemoData(r._raw));
      if (orphans.length === 0) continue;
      await database.batch(...orphans.map((r) => r.prepareDestroyPermanently()));
    }
  });
}

/**
 * Убирает демо-данные при входе под настоящей учётной записью.
 *
 * Иначе демо-объекты соседствуют с боевыми на одном экране и неотличимы от
 * них: пользователь видит «Блок А — надземная часть (демо)» рядом с реальным
 * объектом и считает, что синхронизация притащила мусор с сервера.
 */
export async function purgeDemoDataIfPresent(): Promise<void> {
  try {
    if (!(await hasDemoData())) return;
    console.info('[Demo] Вход под рабочей учётной записью — убираем демо-данные');
    await clearDemoData();
  } catch (err) {
    console.warn('[Demo] Не удалось убрать демо-данные', err);
  }
}

/** Есть ли сейчас демо-данные — чтобы показать это в интерфейсе. */
export async function hasDemoData(): Promise<boolean> {
  try {
    const rows = await database.collections.get('prescriptions').query().fetch();
    return rows.some((r: any) => isDemoId(r.id));
  } catch {
    return false;
  }
}
