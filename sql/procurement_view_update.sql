-- Обновление View: переименована колонка для исключения путаницы с внешними ключами
DROP VIEW IF EXISTS public.v_estimate_resource_balance;
CREATE OR REPLACE VIEW public.v_estimate_resource_balance AS
SELECT
    er.id AS estimate_resource_id,
    er.name,
    er.unit,
    COALESCE(ew.total_quantity * er.norm_per_unit, 0) AS planned_quantity,
    COALESCE(cp.current_price, 0) AS price,
    er.estimate_work_id,
    ew.version_id,
    ew.constructive_id,
    COALESCE(c.name, 'Без раздела') AS wbs_name,
    COALESCE(ew.name, 'Без названия') AS work_name,
    COALESCE(SUM(pri.requested_quantity) FILTER (
        WHERE pr.status NOT IN ('REJECTED', 'DELIVERED')
    ), 0) AS already_requested,
    COALESCE(ew.total_quantity * er.norm_per_unit, 0) - COALESCE(SUM(pri.requested_quantity) FILTER (
        WHERE pr.status NOT IN ('REJECTED', 'DELIVERED')
    ), 0) AS balance_remaining,
    COALESCE(SUM(pri.received_quantity), 0) AS already_received
FROM public.estimate_resources er
LEFT JOIN public.estimate_works ew ON ew.id = er.estimate_work_id
LEFT JOIN public.constructives c ON c.id = ew.constructive_id
LEFT JOIN public.corporate_prices cp ON cp.resource_id = er.id
LEFT JOIN public.purchase_request_items pri ON pri.estimate_resource_id = er.id
LEFT JOIN public.purchase_requests pr ON pr.id = pri.request_id
GROUP BY er.id, er.name, er.unit, ew.total_quantity, er.norm_per_unit, cp.current_price, 
         er.estimate_work_id, ew.version_id, ew.constructive_id, c.name, ew.name;

GRANT SELECT ON public.v_estimate_resource_balance TO authenticated;
