-- Проверка связки мобилка ⇄ оперфакт. Только чтение, под postgres.
-- В нормальном состоянии каждый запрос возвращает 0 строк.

-- 1. Дубли: больше одной карточки на один отчёт мобилки.
select coalesce(mobile_report_id::text, external_id) report, count(*) cards
  from erp.est_operational_facts
 where mobile_report_id is not null or external_id is not null
 group by 1 having count(*) > 1;

-- 2. Отчёт мобилки без карточки оперфакта.
select r.id, r.reported_quantity, r.status, r.created_at
  from mobile.reports r
 where not exists (select 1 from erp.est_operational_facts f where f.mobile_report_id = r.id);

-- 3. Карточка мобилки без отчёта.
select f.id, f.mobile_report_id, f.reported_volume, f.status
  from erp.est_operational_facts f
 where f.mobile_report_id is not null
   and not exists (select 1 from mobile.reports r where r.id = f.mobile_report_id);

-- 4. Статус отчёта не совпадает с решением ERP.
select r.id, r.status mobile_status, f.status erp_status
  from mobile.reports r join erp.est_operational_facts f on f.mobile_report_id = r.id
 where r.status is distinct from case f.status when 'approved' then 'APPROVED'
                                               when 'rejected' then 'REJECTED' else 'PENDING' end;

-- 5. Объём карточки не совпадает с отчётом.
select r.id, r.reported_quantity, f.reported_volume
  from mobile.reports r join erp.est_operational_facts f on f.mobile_report_id = r.id
 where r.reported_quantity is distinct from f.reported_volume;

-- 6. Перебор по работе: подтверждено + на подтверждении больше плана.
select w.id work, w.volume plan,
       sum(f.confirmed_volume) filter (where f.status = 'approved')        confirmed,
       sum(f.reported_volume)  filter (where f.status = 'pending_approval') pending
  from erp.est_doc_works w join erp.est_operational_facts f on f.doc_work_id = w.id
 group by w.id, w.volume
having coalesce(sum(f.confirmed_volume) filter (where f.status = 'approved'), 0)
     + coalesce(sum(f.reported_volume)  filter (where f.status = 'pending_approval'), 0)
     > coalesce(w.volume, 0);

-- 7. Факт в смете расходится с суммой подтверждённого (только для работ с решениями).
select w.id work, w.fact_volume, sum(f.confirmed_volume) approved
  from erp.est_doc_works w join erp.est_operational_facts f on f.doc_work_id = w.id and f.status = 'approved'
 group by w.id, w.fact_volume
having w.fact_volume is distinct from sum(f.confirmed_volume);
