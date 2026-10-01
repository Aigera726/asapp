-- ═══════════════════════════════════════════════════════════════════════════
-- Осиротевшие заявки на привязку.
--
-- Что случилось. В списке «Управление доступом» появилась заявка без email,
-- подписанная обрывком идентификатора (2cfc4a90…). Проверка показала, что
-- в auth.users такого пользователя нет: аккаунт удалили, а строка в
-- mobile.contractor_users осталась.
--
-- Почему так вышло. У contractor_users.profile_id нет внешнего ключа на
-- пользователя, и это сделано намеренно (см. комментарий в
-- 01_mobile_schema.sql): профиль в УСП может появиться позже регистрации в
-- мобилке, и жёсткая связь блокировала бы выдачу доступа. Обратная сторона —
-- удаление аккаунта оставляет висячую заявку.
--
-- Чем мешает. Подтверждать её некому и незачем, а счётчик ожидающих заявок
-- на вкладке «Ещё» и баннер на дашборде считают именно строки со статусом
-- PENDING — то есть админ видит цифру, которую невозможно обнулить.
--
-- Внешний ключ с on delete cascade намеренно НЕ добавляем: это ровно та
-- жёсткая связь, от которой в схеме отказались. Вместо этого убираем мусор
-- и перестаём показывать такие строки в выборке.
--
-- Применять под postgres, после 05_mobile_approval.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Посмотреть, что удалится ────────────────────────────────────────────

select cu.profile_id, cu.contractor_id, cu.status, cu.created_at
from mobile.contractor_users cu
where not exists (select 1 from auth.users u where u.id = cu.profile_id)
order by cu.created_at;


-- ── 2. Удалить ─────────────────────────────────────────────────────────────

delete from mobile.contractor_users cu
where not exists (select 1 from auth.users u where u.id = cu.profile_id);


-- ── 3. Не показывать такие строки впредь ───────────────────────────────────
--
-- Если аккаунт удалят позже, заявка снова осиротеет. Прятать её в выборке
-- надёжнее, чем полагаться на разовую уборку: строка перестанет попадать и
-- в список, и в счётчик, а сама останется в таблице — на случай, если
-- пользователя восстановят.

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
  -- join, а не left join: строка без пользователя в auth.users бессмысленна
  -- для администратора — подтверждать её некому.
  join      auth.users      u on u.id = cu.profile_id
  left join erp.contractors c on c.id = cu.contractor_id
  left join erp.profiles    p on p.id = cu.profile_id
  where p_status is null or cu.status = p_status
  order by (cu.status = 'PENDING') desc, cu.created_at desc;
end;
$$;

grant execute on function mobile.admin_list_links(text) to authenticated;


-- ── 4. Проверка ────────────────────────────────────────────────────────────

select count(*) as осиротевших_осталось
from mobile.contractor_users cu
where not exists (select 1 from auth.users u where u.id = cu.profile_id);
