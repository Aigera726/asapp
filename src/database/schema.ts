import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 10,
  tables: [
    // ... (existing tables)
    tableSchema({
      name: 'construction_objects',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'ext_id', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Contractors
    tableSchema({
      name: 'contractors',
      columns: [
        { name: 'company_name', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Estimate Resources (материалы/ресурсы)
    tableSchema({
      name: 'estimate_resources',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'unit', type: 'string' },
        { name: 'type_id', type: 'number', isOptional: true },
        // Норма расхода на единицу работы. На сервере колонка называется
        // norm_per_unit — переименование делает синхронизация (COLUMN_ALIASES).
        { name: 'norm', type: 'number', isOptional: true },
        // Строка сметы, к которой относится ресурс: без неё нельзя определить,
        // какие материалы списывать при отчёте по работе.
        { name: 'estimate_work_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Projects
    tableSchema({
      name: 'projects',
      columns: [
        { name: 'object_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'ext_id', type: 'string', isOptional: true },
        { name: 'is_apartment', type: 'boolean' },
        { name: 'floors_count', type: 'number' },
        { name: 'sections_count', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Estimate Works (строки сметы)
    tableSchema({
      name: 'estimate_works',
      columns: [
        { name: 'version_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'unit', type: 'string' },
        { name: 'total_quantity', type: 'number' },
        { name: 'ext_id', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Contracts
    tableSchema({
      name: 'contracts',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'contractor_id', type: 'string', isOptional: true },
        { name: 'contract_number', type: 'string', isOptional: true },
        { name: 'ext_id', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Work Assignments (распределение объёмов на подрядчика)
    tableSchema({
      name: 'work_assignments',
      columns: [
        { name: 'estimate_work_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'wbs_item_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'resource_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'contract_id', type: 'string', isIndexed: true },
        { name: 'assignment_type', type: 'string' }, // 'FIXED' | 'OPEN'
        { name: 'assigned_quantity', type: 'number', isOptional: true },
        { name: 'status', type: 'string' }, // 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SUSPENDED'
        { name: 'updated_at', type: 'number' },
      ],
    }),


    // WBS Items (пункты ГПР)
    tableSchema({
      name: 'wbs_items',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'ext_id', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Purchase Requests (ЗАЯВКИ)
    tableSchema({
      name: 'purchase_requests',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'requested_by', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' },
        { name: 'required_date', type: 'number', isOptional: true },
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'request_number', type: 'number', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Purchase Request Items
    tableSchema({
      name: 'purchase_request_items',
      columns: [
        { name: 'request_id', type: 'string', isIndexed: true },
        { name: 'resource_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'estimate_work_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'wbs_item_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'requested_quantity', type: 'number' },
        { name: 'received_quantity', type: 'number' },
        { name: 'item_name', type: 'string', isOptional: true },
        { name: 'unit', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Purchase Orders (ЗАКАЗЫ ПОСТАВЩИКАМ)
    tableSchema({
      name: 'purchase_orders',
      columns: [
        { name: 'request_id', type: 'string', isIndexed: true },
        { name: 'supplier_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'invoice_number', type: 'string', isOptional: true },
        { name: 'total_amount', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Purchase Order Items
    tableSchema({
      name: 'purchase_order_items',
      columns: [
        { name: 'order_id', type: 'string', isIndexed: true },
        { name: 'request_item_id', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'actual_price_per_unit', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Warehouse Receipts (ПРИЕМКА)
    tableSchema({
      name: 'warehouse_receipts',
      columns: [
        { name: 'order_id', type: 'string', isIndexed: true },
        { name: 'received_by', type: 'string', isIndexed: true },
        { name: 'received_at', type: 'number' },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'warehouse_receipt_items',
      columns: [
        { name: 'receipt_id', type: 'string', isIndexed: true },
        { name: 'request_item_id', type: 'string', isIndexed: true },
        { name: 'received_quantity', type: 'number' },
        { name: 'quality_status', type: 'string' }, // OK, DAMAGED, SHORTAGE
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Reports (факт выполнения)
    tableSchema({
      name: 'reports',
      columns: [
        { name: 'assignment_id', type: 'string', isIndexed: true },
        { name: 'reported_by', type: 'string', isOptional: true },
        { name: 'reported_quantity', type: 'number' },
        { name: 'status', type: 'string' }, // 'PENDING' | 'APPROVED' | 'REJECTED'
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'geo_lat', type: 'number', isOptional: true },
        { name: 'geo_lon', type: 'number', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true }, // локальный путь к фото
        { name: 'sync_status', type: 'string' }, // 'draft' | 'pending_sync' | 'synced'
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Documents (подписание)
    tableSchema({
      name: 'documents',
      columns: [
        { name: 'contractor_id', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'signer_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'bpm_instance_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'type', type: 'string' }, // AVR, ASR, KS-2, etc.
        { name: 'number', type: 'string' },
        { name: 'status', type: 'string' }, // PENDING, SIGNED
        { name: 'workflow_status', type: 'string' }, // DRAFT, IN_REVIEW, SIGNED
        { name: 'pdf_url', type: 'string', isOptional: true },
        { name: 'signed_url', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // BPM Tasks
    tableSchema({
      name: 'bpm_instances',
      columns: [
        { name: 'document_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' },
        { name: 'current_step', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'bpm_tasks',
      columns: [
        { name: 'instance_id', type: 'string', isIndexed: true },
        { name: 'assignee_id', type: 'string', isIndexed: true },
        { name: 'step_label', type: 'string' },
        { name: 'action_type', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'document_signatures',
      columns: [
        { name: 'document_id', type: 'string', isIndexed: true },
        { name: 'signer_id', type: 'string', isIndexed: true },
        { name: 'full_name', type: 'string' },
        // ИИН приходит из сертификата ЭЦП и на момент локальной записи
        // подписи неизвестен. isOptional — проверка на уровне JS, DDL в
        // SQLite не меняется, поэтому версия схемы остаётся прежней.
        { name: 'iin', type: 'string', isOptional: true },
        { name: 'signed_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // ══════════════════════════════════════════════════════════════════════
    // РЕСУРСЫ: оборудование, техника, инструменты (единичный учёт)
    // ══════════════════════════════════════════════════════════════════════
    tableSchema({
      name: 'assets',
      columns: [
        // EQUIPMENT | MACHINERY | TOOL — разделение по типу учёта, а не
        // отдельные таблицы: жизненный цикл и движения у них одинаковые.
        { name: 'kind', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'inventory_number', type: 'string', isOptional: true },
        { name: 'serial_number', type: 'string', isOptional: true },
        { name: 'model', type: 'string', isOptional: true },
        // IN_USE | IDLE | REPAIR | DECOMMISSIONED | LOST
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'holder_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'holder_name', type: 'string', isOptional: true },
        { name: 'commissioned_at', type: 'number', isOptional: true },
        { name: 'next_service_at', type: 'number', isOptional: true },
        { name: 'total_hours', type: 'number', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true },
        { name: 'ext_id', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // Движения по единице учёта: выдача, возврат, перемещение, ремонт, смена
    tableSchema({
      name: 'asset_movements',
      columns: [
        { name: 'asset_id', type: 'string', isIndexed: true },
        // ISSUE | RETURN | TRANSFER | SERVICE | SHIFT | DECOMMISSION
        { name: 'type', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'from_holder', type: 'string', isOptional: true },
        { name: 'to_holder', type: 'string', isOptional: true },
        // Наработка за смену — для техники (машино-часы)
        { name: 'hours', type: 'number', isOptional: true },
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true },
        { name: 'occurred_at', type: 'number' },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ══════════════════════════════════════════════════════════════════════
    // МАТЕРИАЛЫ: складской журнал (количественный учёт)
    // ══════════════════════════════════════════════════════════════════════
    // Ведём именно журнал движений, а не изменяемый остаток: остаток —
    // производная величина, и его правка с нескольких устройств офлайн
    // неизбежно приводила бы к расхождениям. Баланс считается агрегацией.
    tableSchema({
      name: 'material_movements',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'resource_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'material_name', type: 'string' },
        { name: 'unit', type: 'string', isOptional: true },
        // RECEIPT | ISSUE | WRITE_OFF | RETURN | TRANSFER | INVENTORY
        { name: 'type', type: 'string', isIndexed: true },
        // Всегда положительное; знак задаёт type (см. MOVEMENT_SIGN)
        { name: 'quantity', type: 'number' },
        { name: 'wbs_item_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'receipt_id', type: 'string', isOptional: true },
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true },
        { name: 'occurred_at', type: 'number' },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ══════════════════════════════════════════════════════════════════════
    // ТЕХНАДЗОР: проверки, предписания, технические отклонения
    // ══════════════════════════════════════════════════════════════════════
    tableSchema({
      name: 'inspections',
      columns: [
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'wbs_item_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'assignment_id', type: 'string', isOptional: true, isIndexed: true },
        // INCOMING | OPERATIONAL | ACCEPTANCE | HIDDEN_WORK
        { name: 'kind', type: 'string', isIndexed: true },
        // PASS | PASS_WITH_REMARKS | FAIL
        { name: 'result', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'inspector_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'inspector_name', type: 'string', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true },
        { name: 'geo_lat', type: 'number', isOptional: true },
        { name: 'geo_lon', type: 'number', isOptional: true },
        { name: 'inspected_at', type: 'number' },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'prescriptions',
      columns: [
        { name: 'number', type: 'string', isOptional: true },
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'inspection_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'contractor_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'issued_by', type: 'string', isOptional: true, isIndexed: true },
        { name: 'issued_by_name', type: 'string', isOptional: true },
        // LOW | MEDIUM | HIGH | CRITICAL
        { name: 'severity', type: 'string', isIndexed: true },
        // OPEN | IN_PROGRESS | SUBMITTED | VERIFIED | REJECTED | CLOSED
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'requirement', type: 'string', isOptional: true },
        { name: 'due_at', type: 'number', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true },
        { name: 'resolution_comment', type: 'string', isOptional: true },
        { name: 'resolution_photo_uri', type: 'string', isOptional: true },
        { name: 'resolved_at', type: 'number', isOptional: true },
        { name: 'closed_at', type: 'number', isOptional: true },
        { name: 'issued_at', type: 'number' },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'deviations',
      columns: [
        { name: 'number', type: 'string', isOptional: true },
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'wbs_item_id', type: 'string', isOptional: true, isIndexed: true },
        // DESIGN | MATERIAL | TECHNOLOGY | GEOMETRY | OTHER
        { name: 'category', type: 'string', isIndexed: true },
        // DRAFT | PENDING | APPROVED | REJECTED | IMPLEMENTED
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'reason', type: 'string', isOptional: true },
        { name: 'proposed_solution', type: 'string', isOptional: true },
        { name: 'requested_by', type: 'string', isOptional: true, isIndexed: true },
        { name: 'requested_by_name', type: 'string', isOptional: true },
        { name: 'decision_comment', type: 'string', isOptional: true },
        { name: 'decided_by', type: 'string', isOptional: true },
        { name: 'decided_at', type: 'number', isOptional: true },
        { name: 'photo_uri', type: 'string', isOptional: true },
        { name: 'requested_at', type: 'number' },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),

  ],
});

