-- ═══════════════════════════════════════════════════════════════════════════
-- Назначение администратора мобильного приложения — по email.
--
-- Зачем отдельный файл. Признак администратора живёт в mobile.app_admins, и
-- insert туда у роли authenticated отозван намеренно (05_mobile_approval.sql):
-- иначе любой вошедший выдал бы права себе. Поэтому первого администратора
-- может создать только этот файл, под postgres.
--
-- Что происходит без него. mobile.is_admin() возвращает false → в приложении
-- не появляется раздел «Ещё → Управление доступом» → подтвердить заявки
-- некому, и они просто лежат в mobile.contractor_users со статусом PENDING.
-- Именно так и получилось: super_boss@mail.ru зашёл, но кнопки не увидел.
--
-- Применять под postgres, после 05_mobile_approval.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Кого назначаем ──────────────────────────────────────────────────────
--
-- Ищем по email, чтобы не переносить UUID руками. Добавьте в массив свои
-- адреса — блок идемпотентен, повторный запуск ничего не испортит.

do $$
declare
  v_emails text[] := array[
    'super_boss@mail.ru'
  ];
  v_email text;
  v_id    uuid;
begin
  foreach v_email in array v_emails loop
    select id into v_id from auth.users where lower(email) = lower(v_email);

    if v_id is null then
      raise warning 'Пользователь % не найден в auth.users — пропущен', v_email;
      continue;
    end if;

    -- Профиль обязателен: admin_list_links join'ит erp.profiles, и без него
    -- в списке заявок не будет имени. Заодно страховка для аккаунтов,
    -- созданных панелью Supabase, — у них профиля может не быть вовсе.
    -- Существующий профиль не трогаем: роль мог задать администратор УСП.
    insert into erp.profiles (id, first_name, last_name, role)
    values (v_id, split_part(v_email, '@', 1), null, 'employee')
    on conflict (id) do nothing;

    insert into mobile.app_admins (profile_id, note)
    values (v_id, v_email)
    on conflict (profile_id) do nothing;

    raise notice 'Администратор назначен: % (%)', v_email, v_id;
  end loop;
end $$;


-- ── 2. Проверка: кто теперь администратор ──────────────────────────────────

select a.profile_id, u.email, a.note, a.created_at
from mobile.app_admins a
left join auth.users u on u.id = a.profile_id
order by a.created_at;


-- ── 3. Что лежит в заявках ─────────────────────────────────────────────────
--
-- PENDING — ждут подтверждения. Заявку самого администратора, если он подал
-- её по ошибке до назначения прав, тоже видно здесь: её можно подтвердить
-- или удалить (delete from mobile.contractor_users where profile_id = '...').

select
  cu.status,
  u.email,
  c.company_name,
  cu.created_at as requested_at,
  cu.approved_at
from mobile.contractor_users cu
left join auth.users       u on u.id = cu.profile_id
left join erp.contractors  c on c.id = cu.contractor_id
order by (cu.status = 'PENDING') desc, cu.created_at desc;
