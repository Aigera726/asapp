-- ═══════════════════════════════════════════════════════════════════════════
-- Ужесточение регистрации: валидация роли, видимая клиенту фактическая роль
-- и починка пользователей, оставшихся без профиля.
--
-- Применять под postgres, ПОСЛЕ 06_fix_profiles_role_check.sql.
-- Блоки 2–4 — разовые, выполнять по одному и смотреть на результат.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. register_profile: whitelist роли и возврат фактической ──────────────
--
-- Что исправляется:
--
--   * Роль не проверялась. profiles_role_check её пропускает — он разрешает и
--     весь вокабуляр УСП (director, admin, ...), поэтому мобильный клиент мог
--     записать себе любое из этих значений. Роль решает, показывать ли приёмку
--     предписаний и отклонений (см. PrescriptionDetailScreen, RLS на role не
--     смотрит вообще), так что проверка нужна именно здесь.
--
--   * Роль молча терялась. Функция намеренно не перезаписывает role у
--     существующего профиля — её мог сменить администратор УСП. Но при
--     регистрации это значило, что выбор «Технадзор» игнорировался, если
--     профиль уже был заведён веб-ERP с role='employee', и пользователь не
--     получал прав, не понимая почему. Теперь функция возвращает роль,
--     которая фактически стоит в профиле, и клиент показывает расхождение.
--
-- Тип возврата меняется, поэтому нужен drop: create or replace на другой
-- returns падает с «cannot change return type of existing function». По той
-- же причине повторное применение 04_mobile_registration.sql после этого
-- файла завершится ошибкой — так и должно быть, 04 больше не применяют.

drop function if exists mobile.register_profile(text, text, text);

create function mobile.register_profile(
  p_first_name text,
  p_last_name  text default null,
  p_role       text default 'employee'
)
-- Имена выходных колонок намеренно не совпадают с колонками erp.profiles:
-- в plpgsql они становятся переменными и перекрывают ссылки на колонки, из-за
-- чего `on conflict (id)` падал бы с «column reference is ambiguous» — тем же
-- образом, как описано для contractor_id в 04_mobile_registration.sql.
returns table (profile_id uuid, effective_role text)
language plpgsql security definer set search_path = mobile, erp, pg_temp
as $$
declare
  v_role   text := nullif(trim(p_role), '');
  v_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select exists (select 1 from erp.profiles p where p.id = auth.uid())
    into v_exists;

  -- Роли мобилки + 'employee' как значение по умолчанию для пользователей,
  -- заведённых веб-ERP (у них нет метаданных мобильной регистрации).
  -- Привилегированные роли (PTO, ORG_ADMIN, ADMIN) назначает администратор
  -- в УСП, из приложения их выдать нельзя.
  --
  -- Проверяем только когда роль действительно будет записана. У существующего
  -- профиля on conflict её не меняет, и отвергать вызов из-за роли, которую
  -- никто не пишет, — значит ломать безобидные операции: экран профиля
  -- сохраняет одно ФИО, а роль у пользователя УСП может быть, например,
  -- 'admin' или 'estimator', и вызов падал бы на ровном месте.
  if not v_exists
     and v_role is not null
     and v_role not in ('CONTRACTOR', 'STOREKEEPER', 'TECH_SUPERVISOR', 'employee')
  then
    raise exception 'Недопустимая роль для регистрации из приложения: %', v_role
      using errcode = '22023';
  end if;

  insert into erp.profiles (id, first_name, last_name, role)
  values (
    auth.uid(),
    nullif(trim(p_first_name), ''),
    nullif(trim(p_last_name), ''),
    coalesce(v_role, 'employee')
  )
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name;
  -- role при повторном вызове не перезаписываем: её мог изменить администратор
  -- УСП, и клиент не должен молча возвращать её к значению из формы.

  return query
    select pr.id, pr.role from erp.profiles pr where pr.id = auth.uid();
end;
$$;

grant execute on function mobile.register_profile(text, text, text) to authenticated;


-- ── 2. Диагностика: кто остался без профиля ────────────────────────────────
--
-- До этого файла auth-пользователя создавал бэкенд, а профиль писал клиент
-- отдельным запросом после отдельного входа. Сбой между шагами оставлял
-- пользователя в auth.users без строки в erp.profiles. Сначала посмотрите,
-- сколько таких, и только потом выполняйте блок 3.

select
  u.id,
  u.email,
  u.created_at,
  u.raw_user_meta_data->>'role' as meta_role,
  p.role                        as profile_role,
  case
    when p.id is null then 'НЕТ ПРОФИЛЯ'
    when u.raw_user_meta_data->>'role' is not null
     and p.role is distinct from u.raw_user_meta_data->>'role' then 'РОЛЬ РАСХОДИТСЯ'
    else 'ok'
  end as state
from auth.users u
left join erp.profiles p on p.id = u.id
order by (p.id is null) desc, u.created_at desc;


-- ── 3. Досоздать пропавшие профили (разово) ────────────────────────────────
--
-- Роль берём из метаданных регистрации, но только если это роль мобилки:
-- иначе профиль не прошёл бы profiles_role_check, и весь insert упал бы
-- целиком из-за одной кривой строки.

insert into erp.profiles (id, first_name, last_name, role)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'first_name'), ''),
    split_part(u.email, '@', 1)
  ),
  nullif(trim(u.raw_user_meta_data->>'last_name'), ''),
  case
    when u.raw_user_meta_data->>'role'
         in ('CONTRACTOR', 'STOREKEEPER', 'TECH_SUPERVISOR')
    then u.raw_user_meta_data->>'role'
    else 'employee'
  end
from auth.users u
left join erp.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;


-- ── 4. Заполнить display_name (разово, необязательно) ──────────────────────
--
-- Supabase Studio показывает в колонке «Display name» значение
-- raw_user_meta_data->>'display_name'. Бэкенд его раньше не писал, поэтому
-- весь список пользователей в панели шёл прочерками и опознать в нём строку
-- было нельзя. Трогаем только тех, у кого имя есть откуда взять.

update auth.users u
   set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'display_name',
            btrim(
              coalesce(u.raw_user_meta_data->>'first_name', p.first_name, '') || ' ' ||
              coalesce(u.raw_user_meta_data->>'last_name',  p.last_name,  '')
            )
          )
  from erp.profiles p
 where p.id = u.id
   and coalesce(u.raw_user_meta_data->>'display_name', '') = ''
   and btrim(
         coalesce(u.raw_user_meta_data->>'first_name', p.first_name, '') || ' ' ||
         coalesce(u.raw_user_meta_data->>'last_name',  p.last_name,  '')
       ) <> '';
