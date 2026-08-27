-- ==========================================
-- AS-APP — создание пользователя с ролью ADMIN
-- ==========================================
--
-- Скрипт выполняется в Supabase → SQL Editor (роль postgres/service_role).
--
-- Есть два способа. ВАРИАНТ А безопаснее и рекомендуется: пароль задаётся
-- средствами Supabase, а не хешируется вручную в SQL. ВАРИАНТ Б нужен, только
-- если доступа к дашборду нет.
--
-- Роль ADMIN в приложении не требует привязки к организации: онбординг
-- (экран «привяжите аккаунт к организации») включается лишь для CONTRACTOR
-- и TECH_SUPERVISOR, поэтому админ попадает сразу в основной интерфейс.


-- ==========================================
-- ВАРИАНТ А (рекомендуется)
-- ==========================================
--
-- Шаг 1. Создать пользователя вручную:
--   Supabase → Authentication → Users → Add user
--     • Email: admin@asgroup.az   (подставьте свой)
--     • Password: задайте сами
--     • Auto Confirm User: ВКЛЮЧИТЬ — иначе вход потребует подтверждения почты
--
-- Шаг 2. Выполнить блок ниже: он создаст/обновит профиль с ролью ADMIN.
--   Впишите тот же email, что и на шаге 1.

DO $$
DECLARE
    v_email TEXT := 'admin@asgroup.az';   -- <<< ПОДСТАВЬТЕ СВОЙ EMAIL
    v_name  TEXT := 'Администратор AS-APP';
    v_uid   UUID;
BEGIN
    SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

    IF v_uid IS NULL THEN
        RAISE EXCEPTION
            'Пользователь % не найден в auth.users. Сначала создайте его: Authentication → Users → Add user (с Auto Confirm).',
            v_email;
    END IF;

    INSERT INTO public.profiles (id, role, full_name)
    VALUES (v_uid, 'ADMIN', v_name)
    ON CONFLICT (id) DO UPDATE
        SET role = 'ADMIN',
            full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

    RAISE NOTICE 'Профиль ADMIN готов для % (id=%)', v_email, v_uid;
END $$;

-- Проверка результата
SELECT u.email, p.role, p.full_name, u.email_confirmed_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role = 'ADMIN';


-- ==========================================
-- ВАРИАНТ Б — целиком через SQL (если дашборд недоступен)
-- ==========================================
--
-- Создаёт запись в auth.users напрямую. Способ рабочий, но Supabase его не
-- документирует: при смене внутренней схемы auth скрипт может перестать
-- работать. Пароль ниже — ЗАГЛУШКА, обязательно замените и смените после
-- первого входа (пароль в открытом виде попадёт в историю SQL Editor).
--
-- Раскомментируйте блок целиком, чтобы выполнить.

/*
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_email    TEXT := 'admin@asgroup.az';        -- <<< ПОДСТАВЬТЕ
    v_password TEXT := 'ЗАМЕНИТЕ_ЭТОТ_ПАРОЛЬ';    -- <<< ПОДСТАВЬТЕ
    v_name     TEXT := 'Администратор AS-APP';
    v_uid      UUID;
BEGIN
    SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

    IF v_uid IS NULL THEN
        v_uid := gen_random_uuid();

        INSERT INTO auth.users (
            id, instance_id, aud, role, email,
            encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at
        ) VALUES (
            v_uid,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            v_email,
            crypt(v_password, gen_salt('bf')),
            NOW(),                                       -- почта сразу подтверждена
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', v_name),
            NOW(), NOW()
        );

        -- Без identity вход по email/паролю не работает
        INSERT INTO auth.identities (
            id, user_id, provider, provider_id, identity_data,
            created_at, updated_at, last_sign_in_at
        ) VALUES (
            gen_random_uuid(), v_uid, 'email', v_uid::text,
            jsonb_build_object('sub', v_uid::text, 'email', v_email),
            NOW(), NOW(), NULL
        );

        RAISE NOTICE 'Создан пользователь % (id=%)', v_email, v_uid;
    ELSE
        UPDATE auth.users
           SET encrypted_password = crypt(v_password, gen_salt('bf')),
               email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
               updated_at = NOW()
         WHERE id = v_uid;

        RAISE NOTICE 'Пароль обновлён для % (id=%)', v_email, v_uid;
    END IF;

    INSERT INTO public.profiles (id, role, full_name)
    VALUES (v_uid, 'ADMIN', v_name)
    ON CONFLICT (id) DO UPDATE SET role = 'ADMIN';
END $$;
*/


-- ==========================================
-- Понизить/сменить роль существующего пользователя
-- ==========================================
-- UPDATE public.profiles p
--    SET role = 'PTO'          -- ADMIN | PTO | TECH_SUPERVISOR | CONTRACTOR | STOREKEEPER
--  FROM auth.users u
--  WHERE u.id = p.id AND u.email = 'admin@asgroup.az';
