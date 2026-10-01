import { schemaMigrations, createTable, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      // Остаток объёма работы: сводка ERP по заданию и история отправок.
      toVersion: 13,
      steps: [
        addColumns({ table: 'work_assignments', columns: [
          { name: 'work_confirmed_volume', type: 'number', isOptional: true },
          { name: 'work_pending_volume', type: 'number', isOptional: true },
          { name: 'assignment_confirmed_volume', type: 'number', isOptional: true },
          { name: 'assignment_pending_volume', type: 'number', isOptional: true },
        ] }),
        addColumns({ table: 'reports', columns: [
          // Watermelon требует обязательный created_at; у старых отчётов 0.
          { name: 'created_at', type: 'number' },
        ] }),
        createTable({
          name: 'work_reports',
          columns: [
            { name: 'mobile_report_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'assignment_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'estimate_work_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'reported_volume', type: 'number' },
            { name: 'confirmed_volume', type: 'number', isOptional: true },
            { name: 'unit', type: 'string', isOptional: true },
            { name: 'status', type: 'string' },
            { name: 'executor_name', type: 'string', isOptional: true },
            { name: 'reported_at', type: 'number', isOptional: true },
            { name: 'decided_at', type: 'number', isOptional: true },
            { name: 'decided_by_name', type: 'string', isOptional: true },
            { name: 'rejection_reason', type: 'string', isOptional: true },
            { name: 'matching_error_details', type: 'string', isOptional: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 12,
      steps: [
        addColumns({ table: 'estimate_resources', columns: [
          { name: 'estimate_quantity', type: 'number', isOptional: true },
          { name: 'resource_kind', type: 'string', isOptional: true },
          { name: 'in_actual_estimate', type: 'boolean' },
        ] }),
        addColumns({ table: 'reports', columns: [
          { name: 'resource_usage', type: 'string', isOptional: true },
        ] }),
      ],
    },
    {
      toVersion: 11,
      steps: [addColumns({
        table: 'work_assignments',
        columns: [{ name: 'is_available', type: 'boolean', isIndexed: true }],
      })],
    },
    {
      // Связь ресурса сметы со строкой работ — основа списания по нормам.
      toVersion: 10,
      steps: [
        addColumns({
          table: 'estimate_resources',
          columns: [
            { name: 'estimate_work_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      // Разделы «Ресурсы» (материалы, оборудование, техника, инструменты) и
      // «Контроль» (проверки технадзора, предписания, отклонения).
      toVersion: 9,
      steps: [
        createTable({
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
        createTable({
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
        createTable({
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
        createTable({
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
        createTable({
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
        createTable({
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
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'estimate_resources',
          columns: [
            { name: 'norm', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'estimate_resources',
          columns: [
            { name: 'type_id', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'purchase_requests',
          columns: [
            { name: 'request_number', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        createTable({
          name: 'purchase_order_items',
          columns: [
            { name: 'order_id', type: 'string', isIndexed: true },
            { name: 'request_item_id', type: 'string', isIndexed: true },
            { name: 'quantity', type: 'number' },
            { name: 'actual_price_per_unit', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
          name: 'purchase_requests',
          columns: [
            { name: 'project_id', type: 'string', isIndexed: true },
            { name: 'requested_by', type: 'string', isIndexed: true },
            { name: 'status', type: 'string' },
            { name: 'required_date', type: 'number', isOptional: true },
            { name: 'comment', type: 'string', isOptional: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'purchase_request_items',
          columns: [
            { name: 'received_quantity', type: 'number' },
            { name: 'item_name', type: 'string', isOptional: true },
            { name: 'unit', type: 'string', isOptional: true },
          ],
        }),
        createTable({
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
        createTable({
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
        createTable({
          name: 'warehouse_receipt_items',
          columns: [
            { name: 'receipt_id', type: 'string', isIndexed: true },
            { name: 'request_item_id', type: 'string', isIndexed: true },
            { name: 'received_quantity', type: 'number' },
            { name: 'quality_status', type: 'string' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'documents',
          columns: [
            { name: 'bpm_instance_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'workflow_status', type: 'string' },
          ],
        }),
        addColumns({
          table: 'projects',
          columns: [
            { name: 'is_apartment', type: 'boolean' },
            { name: 'floors_count', type: 'number' },
            { name: 'sections_count', type: 'number' },
          ],
        }),
        createTable({
          name: 'bpm_instances',
          columns: [
            { name: 'document_id', type: 'string', isIndexed: true },
            { name: 'status', type: 'string' },
            { name: 'current_step', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
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
        createTable({
          name: 'document_signatures',
          columns: [
            { name: 'document_id', type: 'string', isIndexed: true },
            { name: 'signer_id', type: 'string', isIndexed: true },
            { name: 'full_name', type: 'string' },
            { name: 'iin', type: 'string' },
            { name: 'signed_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'contractors',
          columns: [
            { name: 'company_name', type: 'string' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'estimate_resources',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'unit', type: 'string' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'purchase_request_items',
          columns: [
            { name: 'request_id', type: 'string', isIndexed: true },
            { name: 'resource_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'estimate_work_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'wbs_item_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'requested_quantity', type: 'number' },
            { name: 'status', type: 'string' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        addColumns({
          table: 'documents',
          columns: [
            { name: 'project_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'signer_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
        addColumns({
          table: 'work_assignments',
          columns: [
            { name: 'resource_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },

    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'documents',
          columns: [
            { name: 'contractor_id', type: 'string', isIndexed: true },
            { name: 'title', type: 'string' },
            { name: 'type', type: 'string' }, // AVR, ASR, KS-2, etc.
            { name: 'number', type: 'string' },
            { name: 'status', type: 'string' }, // PENDING, SIGNED
            { name: 'pdf_url', type: 'string', isOptional: true },
            { name: 'signed_url', type: 'string', isOptional: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
