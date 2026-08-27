-- ═══════════════════════════════════════════════════════════════════════════
-- Подтверждение доступа администратором.
--
-- До этого файла привязка к контрагенту действовала сразу: кто знал ID
-- контрагента, тот получал работы всех его договоров. Теперь заявка попадает
-- в статус PENDING и не даёт ничего, пока администратор её не подтвердит.
-- Администратор может и сам назначить контрагента пользователю, минуя заявку.
--
-- Применять под postgres, после 04_mobile_registration.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Статус привязки ────────────────────────────────────────────────────────

alter table mobile.contractor_users
  add column if not exists status      text not null default 'PENDING',
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists comment     text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contractor_users_status_chk'
  ) then
    alter table mobile.contractor_users
      add constraint contractor_users_status_chk
      check (status in ('PENDING', 'APPROVED', 'REJECTED'));
  end if;
end $$;

-- Уже заведённые вручную связки считаем подтверждёнными: иначе применение
-- этого файла молча отобрало бы доступ у тех, кто уже работает.
update mobile.contractor_users
   set status = 'APPROVED', approved_at = coalesce(approved_at, now())
 where status = 'PENDING' and created_at < now() - interval '1 second';

create index if not exists contractor_users_status_idx
  on mobile.contractor_users (status);

-- ── Ключевое место: скоуп сужается до подтверждённых ───────────────────────
--
-- Все витрины и политики RLS опираются на my_contractor_ids(), поэтому
-- достаточно поправить её одну — неподтверждённая заявка автоматически
-- перестаёт давать доступ и к работам, и к отчётам, и к складу.

create or replace function mobile.my_contractor_ids() returns setof uuid
language sql stable security definer set search_path = mobile, erp, pg_temp as $$
  select contractor_id
  from mobile.contractor_users
  where profile_id = auth.uid() and status = 'APPROVED'
$$;

-- ── Кто такой администратор ────────────────────────────────────────────────
--
-- Отдельная таблица, а не роль из erp.profiles: набор допустимых значений
-- role задаёт УСП, он может измениться без нашего ведома, и завязка на него
-- однажды тихо раздала бы права доступа всем подряд.

create table if not exists mobile.app_admins (
  profile_id uuid primary key,
  note       text,
  created_at timestamptz not null default now()
);

comment on table mobile.app_admins is
  'Администраторы мобильного приложения. Заполняется вручную под postgres: '
  'insert into mobile.app_admins (profile_id) values (''<uuid>'');';

create or replace function mobile.is_admin() returns boolean
language sql stable security definer set search_path = mobile, pg_temp as $$
  select exists (select 1 from mobile.app_admins a where a.profile_id = auth.uid())
$$;

grant execute on function mobile.is_admin() to authenticated;

-- Свою строку админ видит, чтобы приложение могло показать раздел управления.
alter table mobile.app_admins enable row level security;
drop policy if exists app_admins_select_own on mobile.app_admins;
create policy app_admins_select_own on mobile.app_admins
  for select to authenticated using (profile_id = auth.uid());
grant select on mobile.app_admins to authenticated;
revoke insert, update, delete on mobile.app_admins from authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Функции администратора
--
-- Каждая начинается с проверки is_admin(): security definer выполняется с
-- правами postgres, и без явной проверки любой авторизованный пользователь
-- получил бы полный доступ к чужим заявкам.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function mobile.admin_list_links(p_status text default null)
returns table (
  profile_id      uuid,
  email           text,
  full_name       text,
  contractor_id   uuid,
  company_name    text,
  bin_iin         text,
  status          text,
  requested_at    timestamptz,
  approved_at     timestamptz
)
language plpgsql stable security definer set search_path = mobile, erp, pg_temp
as $$
begin
  if not mobile.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  return query
  select
    cu.profile_id,
    u.email::text,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    cu.contractor_id,
    c.company_name,
    c.bin_iin::text,
    cu.status,
    cu.created_at,
    cu.approved_at
  from mobile.contractor_users cu
  left join erp.contractors c on c.id = cu.contractor_id
  left join erp.profiles    p on p.id = cu.profile_id
  left join auth.users      u on u.id = cu.profile_id
  where p_status is null or cu.status = p_status
  order by (cu.status = 'PENDING') desc, cu.created_at desc;
end;
$$;

/** Подтверждение или отклонение заявки. */
create or replace function mobile.admin_set_link_status(
  p_profile_id    uuid,
  p_contractor_id uuid,
  p_status        text,
  p_comment       text default null
) returns void
language plpgsql security definer set search_path = mobile, erp, pg_temp
as $$
begin
  if not mobile.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  if p_status not in ('PENDING', 'APPROVED', 'REJECTED') then
    raise exception 'Недопустимый статус: %', p_status using errcode = '22023';
  end if;

  update mobile.contractor_users cu
     set status      = p_status,
         comment     = p_comment,
         approved_by = case when p_status = 'APPROVED' then auth.uid() end,
         approved_at = case when p_status = 'APPROVED' then now() end
   where cu.profile_id = p_profile_id
     and cu.contractor_id = p_contractor_id;

  if not found then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;
end;
$$;

/** Назначение контрагента пользователю напрямую, без заявки. */
create or replace function mobile.admin_assign_contractor(
  p_profile_id    uuid,
  p_contractor_id uuid
) returns void
language plpgsql security definer set search_path = mobile, erp, pg_temp
as $$
begin
  if not mobile.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  if not exists (select 1 from erp.contractors c where c.id = p_contractor_id) then
    raise exception 'Контрагент не найден' using errcode = 'P0002';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_profile_id) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;

  insert into mobile.contractor_users
    (contractor_id, profile_id, status, approved_by, approved_at)
  values
    (p_contractor_id, p_profile_id, 'APPROVED', auth.uid(), now())
  on conflict (contractor_id, profile_id) do update
    set status = 'APPROVED', approved_by = auth.uid(), approved_at = now();
end;
$$;

/** Отзыв доступа. Строку удаляем: история хранится в журнале Postgres. */
create or replace function mobile.admin_revoke_contractor(
  p_profile_id    uuid,
  p_contractor_id uuid
) returns void
language plpgsql security definer set search_path = mobile, erp, pg_temp
as $$
begin
  if not mobile.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  delete from mobile.contractor_users cu
   where cu.profile_id = p_profile_id and cu.contractor_id = p_contractor_id;
end;
$$;

/** Справочник контрагентов для админа — erp.contractors закрыт RLS. */
create or replace function mobile.admin_list_contractors(p_search text default null)
returns table (id uuid, company_name text, bin_iin text, users_count bigint)
language plpgsql stable security definer set search_path = mobile, erp, pg_temp
as $$
begin
  if not mobile.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  return query
  select c.id, c.company_name, c.bin_iin::text,
         (select count(*) from mobile.contractor_users cu
           where cu.contractor_id = c.id and cu.status = 'APPROVED')
  from erp.contractors c
  where p_search is null or p_search = ''
     or c.company_name ilike '%' || p_search || '%'
     or c.bin_iin::text like p_search || '%'
  order by c.company_name
  limit 100;
end;
$$;

/** Пользователи приложения — чтобы админ мог назначить контрагента вручную. */
create or replace function mobile.admin_list_users(p_search text default null)
returns table (id uuid, email text, full_name text, linked_count bigint)
language plpgsql stable security definer set search_path = mobile, erp, pg_temp
as $$
begin
  if not mobile.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text,
         nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
         (select count(*) from mobile.contractor_users cu
           where cu.profile_id = u.id and cu.status = 'APPROVED')
  from auth.users u
  left join erp.profiles p on p.id = u.id
  where p_search is null or p_search = ''
     or u.email ilike '%' || p_search || '%'
     or coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'') ilike '%' || p_search || '%'
  order by u.created_at desc
  limit 100;
end;
$$;

grant execute on function
  mobile.admin_list_links(text),
  mobile.admin_set_link_status(uuid, uuid, text, text),
  mobile.admin_assign_contractor(uuid, uuid),
  mobile.admin_revoke_contractor(uuid, uuid),
  mobile.admin_list_contractors(text),
  mobile.admin_list_users(text)
to authenticated;

-- ── Своя заявка: статус нужен приложению, чтобы показать «на рассмотрении» ──

create or replace function mobile.my_link_status()
returns table (contractor_id uuid, company_name text, status text, comment text)
language sql stable security definer set search_path = mobile, erp, pg_temp
as $$
  select cu.contractor_id, c.company_name, cu.status, cu.comment
  from mobile.contractor_users cu
  left join erp.contractors c on c.id = cu.contractor_id
  where cu.profile_id = auth.uid()
  order by (cu.status = 'APPROVED') desc, cu.created_at desc
$$;

grant execute on function mobile.my_link_status() to authenticated;
