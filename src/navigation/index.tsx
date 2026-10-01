import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Icon, IconName } from '@/components/Icon';
import { T } from '@/theme';

// Auth Screens
import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';
import OnboardingScreen from '@/screens/auth/OnboardingScreen';
import AdminAccessScreen from '@/screens/app/AdminAccessScreen';
import ConnectionSetupScreen from '@/screens/auth/ConnectionSetupScreen';

// Вкладки
import DashboardScreen from '@/screens/app/DashboardScreen';
import TasksScreen from '@/screens/app/TasksScreen';
import ResourcesScreen from '@/screens/app/ResourcesScreen';
import ControlScreen from '@/screens/app/ControlScreen';
import HubScreen from '@/screens/app/HubScreen';

// Экраны внутри стека
import SyncStatusScreen from '@/screens/app/SyncStatusScreen';
import ReportFormScreen from '@/screens/app/ReportFormScreen';
import DocumentsScreen from '@/screens/app/DocumentsScreen';
import ProcurementListScreen from '@/screens/app/ProcurementListScreen';
import CreateRequestScreen from '@/screens/app/CreateRequestScreen';
import AcceptanceListScreen from '@/screens/app/AcceptanceListScreen';
import WarehouseAcceptanceScreen from '@/screens/app/WarehouseAcceptanceScreen';
import ApprovalListScreen from '@/screens/app/ApprovalListScreen';
import DocumentViewScreen from '@/screens/app/DocumentViewScreen';
import RequestDetailScreen from '@/screens/app/RequestDetailScreen';
import ProfileScreen from '@/screens/app/ProfileScreen';
import MaterialFormScreen from '@/screens/app/MaterialFormScreen';
import MaterialHistoryScreen from '@/screens/app/MaterialHistoryScreen';
import AssetFormScreen from '@/screens/app/AssetFormScreen';
import AssetDetailScreen from '@/screens/app/AssetDetailScreen';
import InspectionFormScreen from '@/screens/app/InspectionFormScreen';
import PrescriptionFormScreen from '@/screens/app/PrescriptionFormScreen';
import PrescriptionDetailScreen from '@/screens/app/PrescriptionDetailScreen';
import DeviationFormScreen from '@/screens/app/DeviationFormScreen';
import DeviationDetailScreen from '@/screens/app/DeviationDetailScreen';

// ── Stack param lists ────────────────────────────────────────────────────────
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ConnectionSetup: undefined;
};

export type AppStackParamList = {
  MainTabs: undefined;
  Onboarding: undefined;
  AdminAccess: undefined;
  ReportForm: { assignmentId: string; workName?: string; unit?: string };
  ProcurementList: undefined;
  CreateRequest: { projectId: string };
  RequestDetail: { requestId: string };
  AcceptanceList: undefined;
  WarehouseAcceptance: { orderId: string };
  DocumentsTab: undefined;
  DocumentView: { documentId: string };
  ApprovalsTab: undefined;
  SyncStatus: undefined;
  ConnectionSetup: undefined;
  Profile: undefined;

  // Ресурсы
  MaterialForm: { projectId?: string; name?: string; unit?: string; resourceId?: string; type?: string };
  MaterialHistory: { balanceKey: string; name: string; unit?: string; projectId?: string; context?: string; workName?: string };
  AssetForm: { kind?: string };
  AssetDetail: { assetId: string };

  // Контроль
  InspectionForm: { projectId?: string };
  PrescriptionForm: { projectId?: string; inspectionId?: string; title?: string };
  PrescriptionDetail: { prescriptionId: string };
  DeviationForm: { projectId?: string };
  DeviationDetail: { deviationId: string };
};

export type TabParamList = {
  Dashboard: undefined;
  Tasks: { projectId?: string };
  Resources: undefined;
  Control: undefined;
  Hub: undefined;
};

// ── Navigators ───────────────────────────────────────────────────────────────
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ConnectionSetup" component={ConnectionSetupScreen} />
    </AuthStack.Navigator>
  );
}

/**
 * Пять вкладок отражают предметную область, а не историю разработки.
 *
 * Раньше вкладки были: Проекты, Задания, Согласование, Документы, Синхр. —
 * два узких раздела и техническая служебная страница занимали половину
 * основной навигации, а материалы, техника и технадзор не были представлены
 * вообще. Теперь: объекты → работы → ресурсы → контроль, всё остальное — «Ещё».
 */
/**
 * Арифметика высоты таб-бара (проверена замером в браузере).
 *
 * Ряд вкладок = HEIGHT − PADDING·2 − 1px границы = 53.
 * Элемент вкладки добавляет свои 5px сверху и снизу → на контент 43.
 * Контент = иконка (20 + 6 внутренних отступов = 26) + подпись (13) = 39.
 * Остаётся 4px запаса. При меньшей высоте подпись, у которой flexShrink по
 * умолчанию равен 1, сжималась до 7px и буквы срезались.
 */
const TAB_BAR_HEIGHT = 66;
const TAB_BAR_PADDING = 6;

const TABS: {
  name: keyof TabParamList;
  component: React.ComponentType<any>;
  label: string;
  icon: IconName;
}[] = [
  { name: 'Dashboard', component: DashboardScreen, label: 'Объекты', icon: 'domain' },
  { name: 'Tasks', component: TasksScreen, label: 'Работы', icon: 'clipboard-list-outline' },
  { name: 'Resources', component: ResourcesScreen, label: 'Ресурсы', icon: 'package-variant-closed' },
  { name: 'Control', component: ControlScreen, label: 'Контроль', icon: 'shield-check-outline' },
  { name: 'Hub', component: HubScreen, label: 'Ещё', icon: 'dots-horizontal-circle-outline' },
];

function TabNavigator() {
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const insets = useSafeAreaInsets();
  // Заявки на доступ живут в разделе «Ещё → Управление доступом». Без бейджа
  // администратор узнавал о новой заявке только если заходил туда сам.
  const pendingLinkCount = useAuthStore((s) => s.pendingLinkCount);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarPosition: desktop ? 'left' : 'bottom',
        tabBarVariant: desktop ? 'material' : 'uikit',
        tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
        tabBarItemStyle: desktop ? { flexGrow: 0, height: 50, marginBottom: 6, borderRadius: 10 } : undefined,
        tabBarActiveBackgroundColor: desktop ? '#E7EDFC' : undefined,
        // Высота задаётся явно: по умолчанию таб-бар получал 48px, и на
        // иконку 22px с подписью места не оставалось — бокс подписи сжимался
        // до 6px, а буквы обрезались. Плюс нижний отступ под домашний
        // индикатор, иначе подписи заезжают под системный жест.
        tabBarStyle: [
          styles.tabBar,
          {
            height: desktop ? undefined : TAB_BAR_HEIGHT + insets.bottom,
            width: desktop ? 184 : undefined,
            minWidth: desktop ? 184 : undefined,
            paddingTop: desktop ? 24 : TAB_BAR_PADDING,
            paddingHorizontal: desktop ? 12 : 0,
            paddingBottom: desktop ? 16 : TAB_BAR_PADDING + insets.bottom,
            borderTopWidth: desktop ? 0 : 1,
            borderRightWidth: desktop ? 1 : 0,
            borderRightColor: '#DBE0E8',
          },
        ],
        // Активный — фирменный синий: янтарный на светлом фоне не добирает
        // контраста для мелкой подписи вкладки.
        tabBarActiveTintColor: T.colors.primary,
        tabBarInactiveTintColor: T.colors.textMuted,
        tabBarLabelStyle: [styles.tabBarLabel, desktop && { fontSize: 13, lineHeight: 18, fontWeight: '500' }],
        headerShown: false,
      }}
    >
      {TABS.map((t) => (
        <Tab.Screen
          key={t.name}
          name={t.name}
          component={t.component}
          options={{
            tabBarLabel: t.label,
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={20} color={color} />,
            tabBarBadge:
              t.name === 'Hub' && pendingLinkCount > 0 ? pendingLinkCount : undefined,
            tabBarBadgeStyle: styles.tabBarBadge,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="MainTabs" component={TabNavigator} />
      <AppStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AppStack.Screen name="AdminAccess" component={AdminAccessScreen} />
      <AppStack.Screen name="ReportForm" component={ReportFormScreen} />
      <AppStack.Screen name="ProcurementList" component={ProcurementListScreen} />
      <AppStack.Screen name="CreateRequest" component={CreateRequestScreen} />
      <AppStack.Screen name="RequestDetail" component={RequestDetailScreen} />
      <AppStack.Screen name="AcceptanceList" component={AcceptanceListScreen} />
      <AppStack.Screen name="WarehouseAcceptance" component={WarehouseAcceptanceScreen} />
      <AppStack.Screen name="DocumentsTab" component={DocumentsScreen} />
      <AppStack.Screen name="DocumentView" component={DocumentViewScreen} />
      <AppStack.Screen name="ApprovalsTab" component={ApprovalListScreen} />
      <AppStack.Screen name="SyncStatus" component={SyncStatusScreen} />
      <AppStack.Screen name="ConnectionSetup" component={ConnectionSetupScreen} />
      <AppStack.Screen name="Profile" component={ProfileScreen} />

      <AppStack.Screen name="MaterialForm" component={MaterialFormScreen} />
      <AppStack.Screen name="MaterialHistory" component={MaterialHistoryScreen} />
      <AppStack.Screen name="AssetForm" component={AssetFormScreen} />
      <AppStack.Screen name="AssetDetail" component={AssetDetailScreen} />

      <AppStack.Screen name="InspectionForm" component={InspectionFormScreen} />
      <AppStack.Screen name="PrescriptionForm" component={PrescriptionFormScreen} />
      <AppStack.Screen name="PrescriptionDetail" component={PrescriptionDetailScreen} />
      <AppStack.Screen name="DeviationForm" component={DeviationFormScreen} />
      <AppStack.Screen name="DeviationDetail" component={DeviationDetailScreen} />
    </AppStack.Navigator>
  );
}

/** Тема навигации на корпоративной палитре — согласует фон переходов. */
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: T.colors.primary,
    background: T.colors.canvas,
    card: T.colors.surface,
    text: T.colors.textPrimary,
    border: T.colors.border,
    notification: T.colors.accentFill,
  },
};

// ── Root Navigator ───────────────────────────────────────────────────────────
export default function RootNavigation() {
  const { session, contractorId, isAdmin, isDemoMode, profileLoaded, setSession } =
    useAuthStore();

  useEffect(() => {
    // Restore session on startup
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Сессия есть, а профиль ещё не пришёл: решать по contractorId и isAdmin
  // рано — они пока равны значениям по умолчанию, и администратор увидел бы
  // вспышку экрана привязки организации перед входом в приложение.
  //
  // isLoading в этом условии больше нет. Это флаг отправки формы, а не
  // загрузки приложения: пока он был здесь, любая регистрация или вход
  // разбирали весь NavigationContainer, а на возврате он монтировался заново
  // с начального экрана. На неудачной регистрации пользователя выбрасывало из
  // формы на экран входа — со стёртыми полями и без понимания, что произошло.
  // Кнопки на LoginScreen, RegisterScreen и OnboardingScreen показывают
  // отправку сами (ActivityIndicator внутри кнопки), так что заглушка тут
  // ничего не добавляла.
  if (session && !isDemoMode && !profileLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={T.colors.primary} />
      </View>
    );
  }

  // Онбординг — только для тех, кто работает по договору. Администратору
  // привязывать себя не к чему: он управляет чужими доступами, а собственного
  // контрагента у него нет, и без этого исключения он запирался на экране
  // привязки, не добираясь до панели управления.
  const needsOnboarding = session && !isDemoMode && !isAdmin && !contractorId;

  return (
    <NavigationContainer theme={navigationTheme}>
      {!session ? (
        <AuthNavigator />
      ) : needsOnboarding ? (
        <AppStack.Navigator screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="Onboarding" component={OnboardingScreen} />
        </AppStack.Navigator>
      ) : (
        <AppNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: T.colors.canvas,
  },
  tabBar: {
    backgroundColor: T.colors.surfaceRaised,
    borderTopColor: T.colors.border,
    borderTopWidth: 1,
    paddingTop: TAB_BAR_PADDING,
  },
  tabBarBadge: {
    backgroundColor: T.colors.danger,
    color: T.colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  tabBarLabel: {
    fontSize: 10.5,
    // lineHeight фиксирует высоту строки, flexShrink: 0 запрещает контейнеру
    // сжать её при нехватке места: именно так подпись превращалась в 7px
    // и обрезалась (у неё overflow: hidden).
    lineHeight: 13,
    flexShrink: 0,
    fontWeight: '700',
  },
});
