-- ═══════════════════════════════════════════════════════════════════════════
-- Закрыть легаси-таблицу public.access_keys.
--
-- Отдельным файлом, а не внутри 07: это не часть регистрации, а уборка, и
-- решение применять её принимается осознанно.
--
-- Что не так. sql/registration_schema.sql (до интеграции с УСП, схема public)
-- заводил таблицу одноразовых ключей доступа с политикой
--
--     create policy "admin_all_access_keys" on public.access_keys
--       for all to authenticated using (true) with check (true);
--
-- то есть на чтение И запись любому вошедшему пользователю. Ключи доступа для
-- девелоперов может выдать себе кто угодно, включая прораба с телефона.
--
-- При этом таблицу не использует никто: ни мобильное приложение (привязка
-- идёт через mobile.link_contractor по erp.contractors.bin_iin), ни бэкенд
-- УСП — проверено поиском по C:\ERP_DEMO, ни одного упоминания access_keys.
--
-- Поэтому политику снимаем, а таблицу оставляем на месте: удалять данные с
-- боевой базы этот файл не должен, и если ключи всё-таки где-то заведены,
-- они останутся доступны под service_role и postgres.
--
-- Применять под postgres. Если таблицы нет — файл ничего не делает.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'access_keys'
  ) then
    raise notice 'public.access_keys отсутствует — registration_schema.sql не применялся, делать нечего';
    return;
  end if;

  -- RLS без единой политики = доступ только у владельца таблицы и
  -- service_role. Именно то, что нужно: ключи выдаёт суперадмин.
  drop policy if exists "admin_all_access_keys" on public.access_keys;

  alter table public.access_keys enable row level security;

  -- Права, выданные ролям PostgREST, снимаем тоже: RLS не спасает, если
  -- политика когда-нибудь появится снова, а grant остался.
  revoke all on public.access_keys from authenticated, anon;

  raise notice 'public.access_keys закрыта: политика admin_all_access_keys снята, grant отозван';
end $$;

-- Проверка: политик быть не должно.
select policyname from pg_policies
where schemaname = 'public' and tablename = 'access_keys';
