import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';

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
  contractorId: string | null;
  contractorName: string | null;
  /**
   * Заявка на привязку действует не сразу: её подтверждает администратор.
   * contractorId остаётся пустым, пока статус не APPROVED, — на этом и
   * держится ограничение доступа, а не на проверках в интерфейсе.
   */
  linkStatus: LinkStatus;
  linkComment: string | null;
  isAdmin: boolean;
  /**
   * Профиль хотя бы раз загружен с сервера.
   *
   * До этого момента isAdmin и contractorId равны значениям по умолчанию, и
   * навигатор, решая по ним, на долю секунды показывал бы администратору
   * экран привязки организации.
   */
  profileLoaded: boolean;
  isLoading: boolean;
  email: string;
  /**
   * Демо-режим: локальный сеанс без сервера, только для dev-сборки.
   * Нужен, чтобы просматривать интерфейс на тестовых данных, когда бэкенд
   * недоступен. Синхронизация в этом режиме не запускается.
   */
  isDemoMode: boolean;

  // Actions
  setEmail: (email: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /**
   * needsEmailConfirmation — сервер не вернул сессию: почта требует
   * подтверждения. Профиль в этом случае создаётся при первом входе.
   */
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: UserRole
  ) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
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

  /** Только для dev-сборки: войти локально, без обращения к серверу. */
  enterDemoMode: () => void;
}

/** Синтетический пользователь демо-режима. */
const DEMO_USER_ID = 'deadbeef-0000-4000-8000-ffffffffffff';

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  role: null,
  contractorId: null,
  contractorName: null,
  linkStatus: 'NONE',
  linkComment: null,
  isAdmin: false,
  profileLoaded: false,
  isLoading: false,
  email: '',
  isDemoMode: false,

  setEmail: (email) => set({ email }),

  enterDemoMode: () => {
    if (!__DEV__) return;
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
      contractorId: null,
      contractorName: 'Демо-режим · без сервера',
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
      const [firstName, ...rest] = fullName.trim().split(/\s+/);
      const lastName = rest.join(' ');

      // ФИО и роль кладём в метаданные пользователя: при включённом
      // подтверждении почты сессии здесь ещё нет, а значит и профиль в erp
      // завести нельзя — его создаст первый успешный вход из этих данных.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName, role } },
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Ошибка создания пользователя');

      if (!data.session) {
        return { error: null, needsEmailConfirmation: true };
      }

      set({ session: data.session, user: data.session.user });
      await ensureProfile(data.session.user, firstName, lastName, role);
      await get().fetchProfile();

      return { error: null };
    } catch (err: any) {
      return { error: err.message };
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProfile: async () => {
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

    // Профиля может не быть: аккаунт создан, но подтверждение почты прервало
    // регистрацию до его записи. Досоздаём из метаданных, иначе пользователь
    // остался бы без роли и без внятного объяснения.
    if (!profile && !profileRes.error) {
      const meta = user.user_metadata ?? {};
      await ensureProfile(user, meta.first_name, meta.last_name, meta.role);
    }

    set({
      role: (profile?.role as UserRole) ?? (user.user_metadata?.role as UserRole) ?? null,
      contractorId: contractor?.contractor_id ?? null,
      // Название показываем и на неподтверждённой заявке: пользователю важно
      // видеть, к какой организации он просится, пока идёт рассмотрение.
      contractorName: contractor?.company_name ?? link?.company_name ?? null,
      linkStatus: (link?.status as LinkStatus) ?? 'NONE',
      linkComment: link?.comment ?? null,
      isAdmin: adminRes.data === true,
      profileLoaded: true,
    });
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
      contractorId: null,
      contractorName: null,
      linkStatus: 'NONE',
      linkComment: null,
      isAdmin: false,
      profileLoaded: false,
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
      await get().fetchProfile();
      return { error: null };
    } finally {
      set({ isLoading: false });
    }
  },
}));

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Заводит профиль в erp.profiles через RPC.
 *
 * Прямая вставка невозможна — таблица закрыта RLS команды УСП. Функция
 * идемпотентна, поэтому повторный вызов при каждом входе безопасен.
 */
async function ensureProfile(
  user: User,
  firstName?: string,
  lastName?: string,
  role?: string
): Promise<void> {
  const { error } = await supabase.schema('mobile').rpc('register_profile', {
    p_first_name: firstName || user.email?.split('@')[0] || 'Пользователь',
    p_last_name: lastName || null,
    p_role: role || 'employee',
  });
  if (error) {
    console.error('[Auth] Не удалось создать профиль:', error);
  }
}

