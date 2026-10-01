import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { purgeDemoDataIfPresent } from '@/lib/demoData';
import { apiEndpoint } from '@/lib/api';
import { DEMO_BUILD } from '@/lib/demoBuild';

/**
 * Роли из enum public.user_role.
 *
 * ORG_ADMIN добавлен в базу отдельной миграцией (registration_schema.sql) и в
 * типе отсутствовал, хотя такие профили в базе есть — роль не покрывалась ни
 * проверками, ни подписями в интерфейсе.
 */
export type UserRole =
  | 'ADMIN'
  | 'ORG_ADMIN'
  | 'PTO'
  | 'TECH_SUPERVISOR'
  | 'CONTRACTOR'
  | 'STOREKEEPER';

/** Состояние заявки на доступ к контрагенту. */
export type LinkStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  /**
   * ФИО из erp.profiles. Раньше loadProfile их читал и выбрасывал, а экран
   * профиля лез за ними сам — в несуществующую public.profiles.
   */
  firstName: string | null;
  lastName: string | null;
  contractorId: string | null;
  contractorName: string | null;
  /** БИН/ИИН организации — из mobile.my_contractor(). */
  contractorBin: string | null;
  /**
   * Заявка на привязку действует не сразу: её подтверждает администратор.
   * contractorId остаётся пустым, пока статус не APPROVED, — на этом и
   * держится ограничение доступа, а не на проверках в интерфейсе.
   */
  linkStatus: LinkStatus;
  linkComment: string | null;
  isAdmin: boolean;
  /**
   * Сколько заявок на привязку ждут решения. Только для администратора.
   *
   * Раньше о новой заявке узнать было нельзя: она молча ложилась в
   * mobile.contractor_users, а увидеть её можно было, только если
   * администратор сам зашёл в «Ещё → Управление доступом». Счётчик выносит
   * это на вкладку и на дашборд.
   */
  pendingLinkCount: number;
  /**
   * Профиль хотя бы раз загружен с сервера.
   *
   * До этого момента isAdmin и contractorId равны значениям по умолчанию, и
   * навигатор, решая по ним, на долю секунды показывал бы администратору
   * экран привязки организации.
   */
  profileLoaded: boolean;
  /**
   * Почему профиль не прочитался.
   *
   * Раньше ошибки RPC уходили только в console.error. На устройстве их никто
   * не видит, а последствие заметное: без роли и contractorId навигатор
   * запирает пользователя на экране привязки организации без объяснений.
   */
  profileError: string | null;
  isLoading: boolean;
  email: string;
  /**
   * Демо-режим: локальный сеанс без сервера. Доступен в dev и в сборке с
   * EXPO_PUBLIC_ENABLE_DEMO=1 (демо для аналитиков), см. lib/demoBuild.
   * Нужен, чтобы просматривать интерфейс на тестовых данных, когда бэкенд
   * недоступен. Синхронизация в этом режиме не запускается.
   */
  isDemoMode: boolean;

  // Actions
  setEmail: (email: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /**
   * roleMismatch — регистрация прошла, но в профиле стоит другая роль.
   *
   * register_profile не перезаписывает role у существующего профиля (её мог
   * сменить администратор УСП), поэтому выбор в форме мог не примениться.
   * Молчать об этом нельзя: пользователь выбрал «Технадзор», прав приёмки у
   * него нет, и причина ниоткуда не видна.
   *
   * needsEmailConfirmation здесь больше нет: регистрация идёт через бэкенд
   * УСП с email_confirm: true, сессия выдаётся сразу.
   */
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: UserRole
  ) => Promise<{ error: string | null; roleMismatch?: UserRole }>;
  signOut: () => Promise<void>;
  /**
   * force — вызывающий только что изменил данные на сервере (например, подал
   * заявку на привязку). Ответ запроса, начатого до этого изменения, ему не
   * подходит: в нём заявки ещё нет, и пользователь остался бы на экране
   * привязки, хотя заявка уже ушла.
   */
  fetchProfile: (options?: { force?: boolean }) => Promise<void>;
  /** Перечитать число заявок на доступ — после решения по заявке. */
  refreshPendingLinks: () => Promise<void>;
  setSession: (session: Session | null) => void;
  
  // Onboarding actions
  /**
   * Привязка к контрагенту договора по его ID.
   *
   * Список контрагентов выбрать нельзя: erp.contractors закрыт RLS команды
   * УСП, и обычный пользователь не видит ни одной карточки. Поэтому вход по
   * идентификатору из договора — он же выступает ключом доступа, а БИН
   * работает вторым фактором (см. mobile.link_contractor).
   */
  linkToContractor: (contractorId: string, bin?: string) => Promise<{ error: string | null }>;

  /** Войти локально, без обращения к серверу. Только в демо-сборке. */
  enterDemoMode: () => void;
}

/** Синтетический пользователь демо-режима. */
const DEMO_USER_ID = 'deadbeef-0000-4000-8000-ffffffffffff';

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  role: null,
  firstName: null,
  lastName: null,
  contractorId: null,
  contractorName: null,
  contractorBin: null,
  linkStatus: 'NONE',
  linkComment: null,
  isAdmin: false,
  pendingLinkCount: 0,
  profileLoaded: false,
  profileError: null,
  isLoading: false,
  email: '',
  isDemoMode: false,

  setEmail: (email) => set({ email }),

  enterDemoMode: () => {
    if (!DEMO_BUILD) return;
    // Достаточно минимума полей: приложение читает из сессии только user.id.
    const demoUser = {
      id: DEMO_USER_ID,
      email: 'demo@as-app.local',
      user_metadata: { full_name: 'Демо-режим' },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User;

    set({
      isDemoMode: true,
      session: { user: demoUser, access_token: 'demo' } as unknown as Session,
      user: demoUser,
      role: 'ADMIN',
      firstName: 'Демо',
      lastName: 'Режим',
      contractorId: null,
      contractorName: 'Демо-режим · без сервера',
      contractorBin: null,
      isLoading: false,
    });
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (data.session) {
        set({ session: data.session, user: data.session.user });
        await get().fetchProfile();
      }
      return { error: error?.message ?? null };
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, fullName, role) => {
    set({ isLoading: true });
    try {
      // Адрес приводим к тому же виду, в котором логинится LoginScreen
      // (email.trim()). Раньше регистрация шла сырым значением: пробел на
      // конце давал аккаунт, в который потом не войти.
      const cleanEmail = email.trim().toLowerCase();
      const [firstName, ...rest] = fullName.trim().split(/\s+/);
      const lastName = rest.join(' ');

      // На сервере УСП не настроен SMTP: self-service supabase.auth.signUp()
      // падает целиком с «Error sending confirmation email», не создав
      // пользователя. Регистрацию поэтому делает бэкенд УСП через
      // admin.createUser({ email_confirm: true }) — он же заводит профиль в
      // erp.profiles одной операцией с auth-пользователем и откатывает
      // созданного пользователя, если профиль не записался (см. registerMobile
      // в ERP_DEMO/server). После этого обычный signInWithPassword даёт сессию.
      const endpoint = apiEndpoint('/api/auth/register-mobile');
      if (!endpoint) {
        // Иначе fetch уходил на «undefined/api/auth/register-mobile», и
        // пользователь видел сетевую ошибку вместо причины.
        throw new Error(
          'Адрес сервера регистрации не задан — укажите его в настройках сервера'
        );
      }

      const registerRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          first_name: firstName,
          last_name: lastName,
          role,
        }),
      });

      // Ответ не всегда JSON: 502 от прокси приходит HTML-страницей, и
      // registerRes.json() бросал SyntaxError — пользователь читал
      // «Unexpected token <» вместо «сервер недоступен».
      const rawBody = await registerRes.text();
      let registerBody: { error?: string } | null = null;
      try {
        registerBody = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        throw new Error(
          registerRes.ok
            ? 'Сервер регистрации вернул неожиданный ответ'
            : `Сервер регистрации недоступен (${registerRes.status})`
        );
      }
      if (!registerRes.ok) {
        throw new Error(registerBody?.error || 'Ошибка создания пользователя');
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInError) throw signInError;
      if (!data.session) throw new Error('Ошибка создания пользователя');

      // Отдельный ensureProfile здесь больше не нужен: профиль создал бэкенд,
      // а страховка на случай его отсутствия и так есть внутри fetchProfile.
      // Раньше этот вызов дублировал register_profile, который параллельно
      // запускал fetchProfile из слушателя onAuthStateChange, — два
      // конкурентных insert ... on conflict по одному ключу.
      set({ session: data.session, user: data.session.user });
      await get().fetchProfile();

      const effectiveRole = get().role;
      if (effectiveRole && effectiveRole !== role) {
        return { error: null, roleMismatch: effectiveRole };
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProfile: async (options) => {
    // Совпадающие вызовы ждут один и тот же запрос.
    //
    // signInWithPassword поднимает onAuthStateChange, который сам зовёт
    // fetchProfile, — и параллельно его вызывают signIn/signUp. Получалось два
    // набора из четырёх RPC на каждый вход и два конкурентных register_profile
    // (insert ... on conflict по одному ключу может дать deadlock).
    if (profileRequest && !options?.force) return profileRequest;

    // Принудительное чтение встаёт в очередь за текущим, а не рядом с ним:
    // иначе два set() могли записаться в обратном порядке и свежий ответ
    // затёрся бы устаревшим.
    const run: Promise<void> = (profileRequest ?? Promise.resolve())
      .catch(() => {})
      .then(() => loadProfile(set, get))
      .finally(() => {
        // Только если за это время не встал следующий в очередь.
        if (profileRequest === run) profileRequest = null;
      });
    profileRequest = run;
    return run;
  },

  refreshPendingLinks: async () => {
    // Функция admin_list_links сама проверяет права и падает с 42501 у
    // обычного пользователя — не зовём её впустую.
    if (!get().isAdmin) {
      set({ pendingLinkCount: 0 });
      return;
    }

    const { data, error } = await supabase
      .schema('mobile')
      .rpc('admin_list_links', { p_status: 'PENDING' });

    if (error) {
      console.error('[Auth] Не удалось получить заявки на доступ:', error);
      return;
    }
    set({ pendingLinkCount: (data as any[] | null)?.length ?? 0 });
  },

  signOut: async () => {
    const wasDemo = get().isDemoMode;
    set({ isDemoMode: false });
    if (!wasDemo) {
      await supabase.auth.signOut();
    }
    set({
      session: null,
      user: null,
      role: null,
      firstName: null,
      lastName: null,
      contractorId: null,
      contractorName: null,
      contractorBin: null,
      linkStatus: 'NONE',
      linkComment: null,
      isAdmin: false,
      pendingLinkCount: 0,
      profileLoaded: false,
      profileError: null,
    });
  },

  setSession: (session) => {
    // В демо-режиме реальный слушатель авторизации приходит с null и стирал бы
    // локальный сеанс сразу после входа.
    if (get().isDemoMode) return;

    set({
      session,
      user: session?.user ?? null,
    });
    if (session?.user) {
      // Демо-объекты соседствовали бы с боевыми на одном экране и были бы
      // от них неотличимы — пользователь принимал их за мусор с сервера.
      purgeDemoDataIfPresent();
      get().fetchProfile();
    }
  },

  linkToContractor: async (contractorId, bin) => {
    const { user } = get();
    if (!user) return { error: 'Не авторизован' };

    const id = contractorId.trim();
    if (!UUID_RE.test(id)) {
      return { error: 'ID контрагента должен быть UUID из карточки договора' };
    }

    set({ isLoading: true });
    try {
      const { error } = await supabase
        .schema('mobile')
        .rpc('link_contractor', { p_contractor_id: id, p_bin: bin?.trim() || null });

      if (error) return { error: error.message };

      // Без перечитывания профиля contractorId в сторе оставался пустым,
      // корневой навигатор продолжал считать, что нужен онбординг, и
      // пользователь застревал на экране привязки организации.
      await get().fetchProfile({ force: true });
      return { error: null };
    } finally {
      set({ isLoading: false });
    }
  },
}));

/** Текущий запрос профиля; см. fetchProfile. */
let profileRequest: Promise<void> | null = null;

type AuthSet = (partial: Partial<AuthState>) => void;
type AuthGet = () => AuthState;

/** Тело fetchProfile. Вынесено, чтобы дедупликация читалась в одном месте. */
async function loadProfile(set: AuthSet, get: AuthGet): Promise<void> {
  const { user } = get();
  if (!user) return;

  // Профиль и привязка к контрагенту читаются через функции схемы mobile:
  // erp.profiles и erp.contractors закрыты RLS команды УСП, прямой select
  // по ним возвращает пусто даже своему владельцу.
  const [profileRes, contractorRes, linkRes, adminRes] = await Promise.all([
    supabase.schema('mobile').rpc('my_profile'),
    supabase.schema('mobile').rpc('my_contractor'),
    supabase.schema('mobile').rpc('my_link_status'),
    supabase.schema('mobile').rpc('is_admin'),
  ]);

  if (profileRes.error) {
    console.error('[Auth] Не удалось загрузить профиль:', profileRes.error);
  }
  if (contractorRes.error) {
    console.error('[Auth] Не удалось загрузить контрагента:', contractorRes.error);
  }
  if (linkRes.error) {
    console.error('[Auth] Не удалось загрузить статус заявки:', linkRes.error);
  }
  if (adminRes.error) {
    // Обычно означает, что 05_mobile_approval.sql не применён. Молчать
    // нельзя: администратор без этого признака запирается на экране
    // привязки организации, и причина ниоткуда не видна.
    console.error(
      '[Auth] Не удалось проверить права администратора:',
      adminRes.error
    );
  }

  const profile = (profileRes.data as any[] | null)?.[0] ?? null;
  const contractor = (contractorRes.data as any[] | null)?.[0] ?? null;
  // Функция отдаёт подтверждённую привязку первой — берём верхнюю строку.
  const link = (linkRes.data as any[] | null)?.[0] ?? null;

  // Профиля может не быть: аккаунт создан не приложением (панель Supabase,
  // веб-ERP) либо старой версией регистрации, которая писала профиль
  // отдельным запросом после входа. Досоздаём из метаданных, иначе
  // пользователь остался бы без роли и без внятного объяснения.
  let recoveredRole: string | null = null;
  let recoveryError: string | null = null;
  if (!profile && !profileRes.error) {
    const meta = user.user_metadata ?? {};
    const recovery = await ensureProfile(user, meta.first_name, meta.last_name, meta.role);
    recoveredRole = recovery.effectiveRole;
    recoveryError = recovery.error;
  }

  // Ошибку показываем пользователю, а не только в консоли: без роли и
  // contractorId навигатор запирает его на экране привязки организации.
  const profileError =
    profileRes.error?.message ??
    recoveryError ??
    adminRes.error?.message ??
    linkRes.error?.message ??
    contractorRes.error?.message ??
    null;

  set({
    role:
      (profile?.role as UserRole) ??
      (recoveredRole as UserRole) ??
      (user.user_metadata?.role as UserRole) ??
      null,
    firstName: profile?.first_name ?? user.user_metadata?.first_name ?? null,
    lastName: profile?.last_name ?? user.user_metadata?.last_name ?? null,
    contractorId: contractor?.contractor_id ?? null,
    // Название показываем и на неподтверждённой заявке: пользователю важно
    // видеть, к какой организации он просится, пока идёт рассмотрение.
    contractorName: contractor?.company_name ?? link?.company_name ?? null,
    contractorBin: contractor?.bin_iin ?? null,
    linkStatus: (link?.status as LinkStatus) ?? 'NONE',
    linkComment: link?.comment ?? null,
    isAdmin: adminRes.data === true,
    profileLoaded: true,
    profileError,
  });

  // После set(), а не до: refreshPendingLinks смотрит на isAdmin в сторе.
  // profileLoaded уже выставлен, поэтому навигатор не ждёт этот запрос —
  // счётчик просто появится через мгновение.
  if (adminRes.data === true) {
    await get().refreshPendingLinks();
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Заводит профиль в erp.profiles через RPC — страховка на случай, когда его
 * нет: аккаунт создан панелью Supabase, веб-ERP или старой версией
 * регистрации. При обычной регистрации профиль пишет бэкенд УСП.
 *
 * Прямая вставка невозможна — таблица закрыта RLS команды УСП. Функция
 * идемпотентна, поэтому повторный вызов при каждом входе безопасен.
 *
 * Возвращает роль, которая фактически стоит в профиле: register_profile не
 * перезаписывает её у существующего (см. 07_registration_hardening.sql), и
 * запрошенная роль могла не примениться.
 */
async function ensureProfile(
  user: User,
  firstName?: string,
  lastName?: string,
  role?: string
): Promise<{ error: string | null; effectiveRole: string | null }> {
  const { data, error } = await supabase.schema('mobile').rpc('register_profile', {
    p_first_name: firstName || user.email?.split('@')[0] || 'Пользователь',
    p_last_name: lastName || null,
    p_role: role || 'employee',
  });
  if (error) {
    console.error('[Auth] Не удалось создать профиль:', error);
    return { error: error.message, effectiveRole: null };
  }
  const row = (data as any[] | null)?.[0] ?? null;
  return { error: null, effectiveRole: row?.effective_role ?? null };
}

