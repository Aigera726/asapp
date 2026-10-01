-- ==========================================
-- FIX: profiles_role_check не пропускает роли мобилки
-- Выполнять по одному блоку, под postgres!
-- ==========================================

-- 1. Посмотреть текущее определение constraint (сверить со списком в шаге 2,
--    прежде чем его пересоздавать — вдруг там есть значения, которых нет
--    среди текущих строк erp.profiles).
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'erp.profiles'::regclass
  and conname = 'profiles_role_check';

-- 2. mobile.register_profile() пишет роли мобилки (CONTRACTOR, STOREKEEPER,
--    TECH_SUPERVISOR, ADMIN, ORG_ADMIN, PTO — см. bunyad.sql, тип user_role)
--    напрямую в erp.profiles.role. Constraint сейчас разрешает только
--    вокабуляр УСП (employee/manager/director/estimator/lawyer/rop/pricer/
--    senior_manager/financial_director/admin) — регистрация из мобилки
--    падает с 23514 на любой роли, кроме случайного совпадения.
--    Расширяем список, ничего не убирая из значений УСП.
alter table erp.profiles drop constraint if exists profiles_role_check;

alter table erp.profiles add constraint profiles_role_check check (
  role = any (array[
    -- роли УСП (веб-ERP) — как было
    'employee', 'manager', 'director', 'estimator', 'lawyer',
    'senior_manager', 'rop', 'pricer', 'financial_director', 'admin',
    -- роли мобилки (as-app), регистр как в user_role/UserRole
    'ADMIN', 'ORG_ADMIN', 'PTO', 'TECH_SUPERVISOR', 'CONTRACTOR', 'STOREKEEPER'
  ])
);
