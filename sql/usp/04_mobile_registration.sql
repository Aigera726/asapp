-- ═══════════════════════════════════════════════════════════════════════════
-- Регистрация подрядчика из мобилки и привязка к контрагенту договора.
--
-- Почему через RPC, а не прямыми запросами:
--   * erp.profiles и erp.contractors закрыты RLS команды УСП — обычная роль
--     не может ни прочитать карточку контрагента, ни завести себе профиль;
--   * insert в mobile.contractor_users отозван у authenticated намеренно
--     (02_mobile_rls.sql): иначе прораб приписал бы себя к любому контрагенту.
-- Функции security definer выполняются с правами postgres и делают ровно то,
-- что разрешено, — вся проверка собрана в одном месте.
--
-- Применять под postgres.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Профиль пользователя ───────────────────────────────────────────────────

create or replace function mobile.register_profile(
  p_first_name text,
  p_last_name  text default null,
  p_role       text default 'employee'
) returns void
language plpgsql security definer set search_path = mobile, erp, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  insert into erp.profiles (id, first_name, last_name, role)
  values (auth.uid(), nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''), p_role)
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name;
  -- role при повторном вызове не перезаписываем: её мог изменить администратор
  -- УСП, и клиент не должен молча возвращать её к значению из формы.
end;
$$;

-- ── Привязка к контрагенту ─────────────────────────────────────────────────

create or replace function mobile.link_contractor(
  p_contractor_id uuid,
  p_bin           text default null
) returns table (contractor_id uuid, company_name text)
language plpgsql security definer set search_path = mobile, erp, pg_temp
as $$
declare
  v_contractor erp.contractors%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Не авторизован' using errcode = '28000';
  end if;

  select * into v_contractor from erp.contractors c where c.id = p_contractor_id;
  if not found then
    raise exception 'Контрагент с таким ID не найден' using errcode = 'P0002';
  end if;

  -- Второй фактор. Идентификатор контрагента — это, по сути, ключ доступа:
  -- кто его знает, тот войдёт в договоры компании. Угадать UUID нельзя, но
  -- утечь он может, поэтому при заполненном БИН требуем и его. Если БИН в
  -- карточке пуст, проверять нечего — пропускаем, иначе привязка стала бы
  -- невозможной на неполных данных.
  if coalesce(v_contractor.bin_iin, '') <> ''
     and coalesce(nullif(trim(p_bin), ''), '') <> v_contractor.bin_iin then
    raise exception 'БИН/ИИН не совпадает с карточкой контрагента'
      using errcode = 'P0001';
  end if;

  -- Цель конфликта не указываем намеренно: имя выходной колонки функции
  -- (contractor_id) перекрывает одноимённую колонку таблицы, и явный
  -- `on conflict (contractor_id, profile_id)` падает с «column reference is
  -- ambiguous». Уникальное ограничение здесь ровно одно — первичный ключ.
  insert into mobile.contractor_users (contractor_id, profile_id)
  values (p_contractor_id, auth.uid())
  on conflict do nothing;

  return query select v_contractor.id, v_contractor.company_name;
end;
$$;

-- ── Чтение своей привязки ──────────────────────────────────────────────────
--
-- Приложению нужно знать название компании, а erp.contractors закрыт RLS.
-- Отдаём только те карточки, к которым пользователь уже привязан.

create or replace function mobile.my_contractor()
returns table (
  contractor_id  uuid,
  company_name   text,
  bin_iin        text,
  contracts_count bigint,
  works_count     bigint
)
language sql stable security definer set search_path = mobile, erp, pg_temp
as $$
  select
    c.id,
    c.company_name,
    c.bin_iin,
    (select count(*) from erp.contracts k where k.contractor_id = c.id),
    -- Считаем по базовым таблицам, а не через mobile.v_assignments: иначе
    -- этот файл нельзя применить раньше 03_mobile_views.sql, и порядок
    -- применения превращается в ловушку с невнятной ошибкой 42P01.
    (select count(*)
       from erp.contract_assignments ca
       join erp.contracts k2 on k2.id = ca.contract_id
      where k2.contractor_id = c.id)
  from erp.contractors c
  where c.id in (select mobile.my_contractor_ids())
$$;

-- ── Профиль текущего пользователя ──────────────────────────────────────────

create or replace function mobile.my_profile()
returns table (id uuid, first_name text, last_name text, role text)
language sql stable security definer set search_path = mobile, erp, pg_temp
as $$
  select p.id, p.first_name, p.last_name, p.role
  from erp.profiles p
  where p.id = auth.uid()
$$;

grant execute on function
  mobile.register_profile(text, text, text),
  mobile.link_contractor(uuid, text),
  mobile.my_contractor(),
  mobile.my_profile()
to authenticated;
