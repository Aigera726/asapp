import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import Project from '@/database/models/Project';
import Contract from '@/database/models/Contract';
import WorkAssignment from '@/database/models/WorkAssignment';
import Report from '@/database/models/Report';
import Prescription from '@/database/models/Prescription';
import { useAuthStore } from '@/store/authStore';
import { syncDatabase } from '@/database/sync';
import { T } from '@/theme';
import { Icon, IconName } from '@/components/Icon';
import { ECO as E } from '@/theme/ecopro';
import { Card, EmptyState } from '@/components/ui';
import { getRoleLabel } from '@/lib/roleLabels';
import { PRESCRIPTION_OPEN_STATUSES, isOverdue } from '@/lib/domain';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const enhance = withObservables([], () => ({
  projects: database.collections.get<Project>('projects').query(),
  contracts: database.collections.get<Contract>('contracts').query(),
  assignments: database.collections.get<WorkAssignment>('work_assignments').query(Q.where('is_available', true)),
  pendingReports: database.collections
    .get<Report>('reports')
    .query(Q.where('sync_status', Q.oneOf(['pending_sync', 'draft']))),
  prescriptions: database.collections.get<Prescription>('prescriptions').query(),
}));

interface Props {
  projects: Project[];
  contracts: Contract[];
  assignments: WorkAssignment[];
  pendingReports: Report[];
  prescriptions: Prescription[];
}

/** Быстрые переходы в разделы, которых нет во вкладках. */
const QUICK_ACTIONS: { icon: IconName; label: string; route: string; params?: object }[] = [
  { icon: 'clipboard-search-outline', label: 'Проверка', route: 'InspectionForm' },
  { icon: 'clipboard-alert-outline', label: 'Предписание', route: 'PrescriptionForm' },
  { icon: 'package-variant-closed', label: 'Материалы', route: 'MaterialForm' },
  { icon: 'cart-outline', label: 'Закупки', route: 'ProcurementList' },
];

function DashboardScreen({
  projects,
  contracts,
  assignments,
  pendingReports,
  prescriptions,
}: Props) {
  const navigation = useNavigation<any>();
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const roomy = containerWidth >= 700;
  const columns = containerWidth >= 1200 ? 3 : roomy ? 2 : 1;
  const pagePadding = roomy ? 32 : 20;
  const contentWidth = Math.min(containerWidth, 1480) - pagePadding * 2;
  const cardWidth = (contentWidth - (columns - 1) * 16) / columns;
  const { role, contractorName, isDemoMode, isAdmin, pendingLinkCount, firstName, lastName, user } = useAuthStore();
  const accountName = [firstName, lastName].filter(Boolean).join(' ') || user?.email || 'Пользователь';
  const accountRole = isAdmin ? 'Администратор' : getRoleLabel(role);
  const initials = [firstName, lastName].filter(Boolean).map(n => n![0]).join('').slice(0, 2).toUpperCase() || accountName[0].toUpperCase();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);

  const projectStats = useMemo(() => {
    const stats: Record<string, number> = {};
    projects.forEach((p) => {
      const contractIds = new Set(
        contracts.filter((c) => c.projectId === p.id).map((c) => c.id)
      );
      stats[p.id] = assignments.filter((a) => contractIds.has(a.contractId)).length;
    });
    return stats;
  }, [projects, contracts, assignments]);

  const filteredProjects = projects.filter((p) => (projectStats[p.id] || 0) > 0);

  const visibleProjects = filteredProjects.filter(p => p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  const openPrescriptions = prescriptions.filter((p) =>
    PRESCRIPTION_OPEN_STATUSES.includes(p.status)
  );
  const overdue = prescriptions.filter((p) => isOverdue(p.dueAt, p.status));

  const onRefresh = async (silent = false) => {
    // В демо-режиме сервера нет — синхронизация только показала бы ошибку.
    if (isDemoMode) return;
    setRefreshing(true);
    setSyncError(null);
    try {
      await syncDatabase();
    } catch (err: any) {
      // Ошибка синхронизации уходила только в консоль: пользователь тянул
      // список вниз, ничего не менялось, и причина оставалась невидимой.
      console.error('[Dashboard] Sync failed:', err);
      const message = err?.message ?? 'Не удалось синхронизировать данные';
      setSyncError(message);
      if (!silent) Alert.alert('Ошибка синхронизации', message);
    } finally {
      setRefreshing(false);
    }
  };

  // Авто-синхронизация при первом открытии: молча, чтобы холодный старт без
  // сети не встречал пользователя модальным окном — причина видна в плашке.
  useEffect(() => {
    onRefresh(true);
  }, []);

  const header = (
    <>
      <View style={styles.intro}>
        <Text style={styles.kicker}>РАБОЧЕЕ ПРОСТРАНСТВО</Text>
        <Text accessibilityRole="header" style={[styles.pageTitle, roomy && { fontSize: 32, lineHeight: 40 }]}>{firstName ? 'Здравствуйте, ' + firstName : 'Мои объекты'}</Text>
        <Text style={styles.pageSubtitle}>Всё для работы на строительной площадке</Text>
      </View>
      <View style={[styles.hero, roomy && styles.heroWide]}>
        <View style={styles.heroHeading}>
          <View style={styles.heroSymbol}><Icon name="clipboard-check-outline" size={25} color={E.blue} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTag}>ОПЕРАТИВНЫЙ УЧЁТ</Text>
            <Text style={styles.heroTitle}>Фиксируйте выполненные работы</Text>
            <Text style={styles.heroText}>Выберите задание и внесите объём за день.</Text>
          </View>
        </View>
        <TouchableOpacity accessibilityRole="button" style={[styles.heroButton, roomy && { marginTop: 0 }]} onPress={() => navigation.navigate('Tasks', {})}><Text style={styles.heroButtonText}>Перейти к работам</Text><Icon name="arrow-right" size={18} color="#FFFFFF" /></TouchableOpacity>
      </View>
      {isDemoMode && <View style={styles.demoLabel}><View style={styles.demoDot} /><Text style={styles.demoText}>Демо-режим · примеры данных</Text></View>}
      {/* Заявки на доступ — самое верхнее: пока их не подтвердят, подрядчик
          сидит на экране «Заявка на рассмотрении» и работать не может.
          Раньше о новой заявке нигде не сообщалось, и она могла лежать
          сколько угодно. */}
      {isAdmin && pendingLinkCount > 0 ? (
        <TouchableOpacity
          style={styles.linkRequestBanner}
          onPress={() => navigation.navigate('AdminAccess')}
          activeOpacity={0.8}
        >
          <Icon name="account-clock-outline" size={20} color={E.blue} />
          <Text style={styles.linkRequestText}>
            Заявок на доступ: {pendingLinkCount}
          </Text>
          <Icon name="chevron-right" size={18} color={E.blue} />
        </TouchableOpacity>
      ) : null}

      {/* Требует внимания — выше сводки: просроченное предписание важнее
          общего количества объектов. */}
      {overdue.length > 0 ? (
        <TouchableOpacity
          style={styles.alertBanner}
          onPress={() => navigation.navigate('Control')}
          activeOpacity={0.8}
        >
          <Icon name="alert-circle-outline" size={20} color={T.colors.danger} />
          <Text style={styles.alertText}>
            Просрочено предписаний: {overdue.length}
          </Text>
          <Icon name="chevron-right" size={18} color={T.colors.danger} />
        </TouchableOpacity>
      ) : null}

      {syncError ? (
        <TouchableOpacity style={styles.syncErrorBanner} onPress={() => onRefresh()} activeOpacity={0.8}>
          <Icon name="cloud-off-outline" size={18} color={T.colors.warning} />
          <Text style={styles.syncErrorText} numberOfLines={2}>
            {syncError}
          </Text>
          <Text style={styles.syncErrorAction}>Повторить</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.statsRow}>
        {[{ value: filteredProjects.length, label: 'Объектов', icon: 'domain' as IconName, route: null }, { value: assignments.length, label: 'Заданий', icon: 'clipboard-list-outline' as IconName, route: 'Tasks' }, { value: openPrescriptions.length, label: 'Предписаний', icon: 'shield-check-outline' as IconName, route: 'Control' }].map(stat => {
          const content = <><View style={styles.statTop}><Icon name={stat.icon} size={19} color={E.blue} />{stat.route && <Icon name="arrow-top-right" size={14} color={E.muted} />}</View><Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statLabel}>{stat.label}</Text></>;
          return stat.route ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={stat.label + ': ' + stat.value} key={stat.label} style={styles.stat} onPress={() => navigation.navigate(stat.route, {})}>{content}</TouchableOpacity> : <View key={stat.label} style={styles.stat}>{content}</View>;
        })}
      </View>

      {pendingReports.length > 0 ? (
        <TouchableOpacity
          style={styles.pendingRow}
          onPress={() => navigation.navigate('SyncStatus')}
          activeOpacity={0.8}
        >
          <Icon name="cloud-upload-outline" size={18} color={E.blue} />
          <Text style={styles.pendingText}>
            Ожидает отправки: {pendingReports.length}
          </Text>
          <Icon name="chevron-right" size={18} color={T.colors.textDisabled} />
        </TouchableOpacity>
      ) : null}

      <Text style={styles.sectionTitle}>Быстрые действия</Text>
      <View style={styles.actionsRow}>
        {QUICK_ACTIONS.map((a) => (
          <TouchableOpacity
            key={a.route + a.label}
            style={[styles.actionBtn, roomy && { flexBasis: '22%' }]}
            onPress={() => navigation.navigate(a.route, a.params)}
            activeOpacity={0.75}
          >
            <View style={styles.actionIcon}>
              <Icon name={a.icon} size={22} color={E.blue} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={2}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Объекты</Text><Text style={styles.sectionCount}>{filteredProjects.length}</Text></View>
      <View style={styles.search}><Icon name="magnify" size={20} color={E.muted} /><TextInput accessibilityLabel="Поиск объекта" value={search} onChangeText={setSearch} placeholder="Найти объект" placeholderTextColor={E.muted} style={styles.searchInput} autoCorrect={false} />{search !== '' && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Очистить поиск" onPress={() => setSearch('')} style={styles.clearSearch}><Icon name="close" size={18} color={E.muted} /></TouchableOpacity>}</View>
    </>
  );

  return (
    <View style={styles.container} onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={[styles.headerInner, { paddingHorizontal: pagePadding }]}>
          <View style={styles.headerLeft}>
            <View style={styles.brandRow}><View style={styles.brandMark}><Icon name="cube-outline" size={21} color="#FFFFFF" /></View><Text style={styles.brandText}>AS<Text style={{ color: E.blue }}> APP</Text></Text></View>
            {roomy && <View style={styles.orgBlock}><Text style={styles.orgLabel}>ОРГАНИЗАЦИЯ</Text><Text style={styles.account} numberOfLines={1}>{contractorName || 'AS Group'}</Text></View>}
          </View>
          {roomy && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Обновить данные" disabled={refreshing || isDemoMode} onPress={() => onRefresh()} style={styles.refreshBtn}>{refreshing ? <ActivityIndicator color={E.blue} /> : <Icon name="refresh" size={20} color={isDemoMode ? '#A2AAB7' : E.muted} />}</TouchableOpacity>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Профиль: ' + accountName + ', ' + accountRole} onPress={() => navigation.navigate('Profile')} style={[styles.profileBtn, !roomy && styles.profileCompact]} activeOpacity={0.75}>
            <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
            <View style={styles.profileText}><Text numberOfLines={1} style={styles.profileName}>{accountName}</Text><Text numberOfLines={1} style={styles.profileRole}>{accountRole}</Text></View>
            {roomy && <Icon name="chevron-down" size={17} color={E.muted} />}
          </TouchableOpacity>
        </View>
        {!roomy && <View style={styles.mobileOrg}><Icon name="domain" size={13} color={E.muted} /><Text numberOfLines={1} style={styles.mobileOrgText}>{contractorName || 'AS Group'}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Обновить данные" disabled={refreshing || isDemoMode} onPress={() => onRefresh()} style={styles.mobileRefresh}>{refreshing ? <ActivityIndicator size="small" color={E.blue} /> : <Icon name="refresh" size={17} color={E.muted} />}</TouchableOpacity></View>}
      </View>

      <FlatList
        key={columns}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: 16 } : undefined}
        data={visibleProjects}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingHorizontal: pagePadding }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => onRefresh()}
            tintColor={E.blue}
          />
        }
        renderItem={({ item }) => (
          <Card style={[styles.projectCard, { width: cardWidth }]} onPress={() => navigation.navigate('Tasks', { projectId: item.id })}>
            <View style={styles.projectTop}>
              <View style={styles.projectIcon}>
                <Icon name="office-building-outline" size={20} color={E.blue} />
              </View>
              <View style={styles.projectBody}>
                <Text style={styles.projectName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.projectMeta}>
                  {projectStats[item.id] || 0} заданий
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={T.colors.textDisabled} />
            </View>
            <View style={styles.projectFooter}>
              <View style={styles.projectBadge}><Icon name="file-document-outline" size={14} color={E.muted} /><Text style={styles.projectBadgeText}>Договоров: {contracts.filter(c => c.projectId === item.id).length}</Text></View><Text style={styles.openProject}>Открыть работы →</Text>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="office-building-outline"
            title={search.trim() ? "Ничего не найдено" : "Объектов пока нет"}
            text={search.trim() ? "Попробуйте другое название объекта." : "Здесь появятся объекты с назначенными работами после синхронизации."}
            actionLabel={search.trim() ? "Сбросить поиск" : "Проверить синхронизацию"}
            onAction={() => search.trim() ? setSearch('') : navigation.navigate('SyncStatus')}
          />
        }
      />
    </View>
  );
}

export default enhance(DashboardScreen);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: E.paper },
  header: { backgroundColor: E.surface, borderBottomWidth: 1, borderBottomColor: E.line },
  headerInner: { width: '100%', maxWidth: 1480, alignSelf: 'center', minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  headerLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 26 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: E.blue, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 21, fontWeight: '600', letterSpacing: -0.8, color: E.ink },
  orgBlock: { flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: E.line, paddingLeft: 24 },
  orgLabel: { fontSize: 8, letterSpacing: 1.1, color: E.muted, marginBottom: 5 },
  account: { fontSize: 12, color: E.ink },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 12, maxWidth: 290 },
  profileCompact: { maxWidth: '52%', gap: 7, paddingHorizontal: 0 },
  avatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 14, fontWeight: '600', color: E.blue },
  profileText: { flexShrink: 1, minWidth: 0 },
  profileName: { fontSize: 13, fontWeight: '600', color: E.ink },
  profileRole: { fontSize: 11, color: E.muted, marginTop: 4 },
  refreshBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: E.line, marginRight: 2 },
  mobileOrg: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 20, borderTopWidth: 1, borderTopColor: '#EDF0F5', minHeight: 40 },
  mobileOrgText: { fontSize: 11, color: E.muted, flex: 1 },
  mobileRefresh: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, paddingBottom: 32, flexGrow: 1, width: '100%', maxWidth: 1480, alignSelf: 'center' },
  intro: { marginTop: 4, marginBottom: 22 },
  kicker: { fontSize: 9, letterSpacing: 1.6, color: E.muted, marginBottom: 9 },
  pageTitle: { fontSize: 27, lineHeight: 34, fontWeight: '600', letterSpacing: -0.7, color: E.ink },
  pageSubtitle: { fontSize: 13, lineHeight: 20, color: E.muted, marginTop: 6 },
  hero: { backgroundColor: '#EDF2FE', borderWidth: 1, borderColor: '#DEE6FA', borderRadius: 14, padding: 20, marginBottom: 20, gap: 16 },
  heroWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 24, paddingHorizontal: 26 },
  heroHeading: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  heroSymbol: { width: 48, height: 48, backgroundColor: '#FFFFFF', borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1 },
  heroTag: { fontSize: 8, letterSpacing: 1.4, fontWeight: '600', color: E.blue, marginBottom: 7 },
  heroTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3, color: E.navy },
  heroText: { fontSize: 12, lineHeight: 19, marginTop: 5, color: E.muted },
  heroButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 16, borderRadius: 9, backgroundColor: E.blue },
  heroButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  demoLabel: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 16 },
  demoDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: E.blue },
  demoText: { fontSize: 11, color: E.muted },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    padding: T.spacing.md,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.dangerSoft,
    borderWidth: 1,
    borderColor: T.colors.dangerBorder,
    marginBottom: T.spacing.md,
  },
  alertText: { ...T.font.small, fontWeight: '700', color: T.colors.danger, flex: 1 },

  linkRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    padding: T.spacing.md,
    borderRadius: T.radius.md,
    // Синий, а не красный: заявка — это задача администратора, а не авария.
    backgroundColor: E.soft,
    borderWidth: 1,
    borderColor: E.soft,
    marginBottom: T.spacing.md,
  },
  linkRequestText: { ...T.font.small, fontWeight: '700', color: E.blue, flex: 1 },

  syncErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    padding: T.spacing.md,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.warningSoft,
    borderWidth: 1,
    borderColor: T.colors.warningBorder,
    marginBottom: T.spacing.md,
  },
  syncErrorText: { ...T.font.caption, color: T.colors.warning, flex: 1 },
  syncErrorAction: { ...T.font.caption, color: T.colors.textPrimary },


  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  stat: { flex: 1, backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 12, padding: 12 },
  statTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
  statValue: { color: E.ink, fontSize: 27, fontWeight: '500', letterSpacing: -1 },
  statLabel: { color: E.muted, fontSize: 10, marginTop: 4 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, backgroundColor: E.soft, marginBottom: 16 },
  pendingText: { fontSize: 12, color: E.blue, flex: 1 },
  sectionTitle: { color: E.ink, fontSize: 17, fontWeight: '600', marginTop: 8, marginBottom: 14, letterSpacing: -0.3 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  actionBtn: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 12, backgroundColor: E.surface, borderWidth: 1, borderColor: E.line },
  actionIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, color: E.ink, fontWeight: '500', flexShrink: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionCount: { fontSize: 12, color: E.muted },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 10, paddingLeft: 14, marginBottom: 16 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 14, paddingRight: 12, fontSize: 14, color: E.ink },
  clearSearch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  projectCard: { backgroundColor: E.surface, borderColor: E.line, borderRadius: 14, padding: 17, shadowOpacity: 0, elevation: 0 },
  projectTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center' },
  projectBody: { flex: 1 },
  projectName: { fontSize: 15, fontWeight: '600', color: E.ink, lineHeight: 21 },
  projectMeta: { fontSize: 12, color: E.muted, marginTop: 4 },
  projectFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: E.line },
  projectBadge: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  projectBadgeText: { fontSize: 11, color: E.muted },
  openProject: { fontSize: 11, fontWeight: '500', color: E.blue },
});
