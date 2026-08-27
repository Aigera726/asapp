import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
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
import { BrandWordmark } from '@/components/Brand';
import { Card, StatTile, Badge, EmptyState } from '@/components/ui';
import { getAccountSubtitle } from '@/lib/roleLabels';
import { PRESCRIPTION_OPEN_STATUSES, isOverdue } from '@/lib/domain';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const enhance = withObservables([], () => ({
  projects: database.collections.get<Project>('projects').query(),
  contracts: database.collections.get<Contract>('contracts').query(),
  assignments: database.collections.get<WorkAssignment>('work_assignments').query(),
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
  const { role, contractorName, isDemoMode } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
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
        <StatTile value={filteredProjects.length} label="Активных объектов" />
        <StatTile
          value={assignments.length}
          label="Заданий в работе"
          onPress={() => navigation.navigate('Tasks', {})}
        />
        <StatTile
          value={openPrescriptions.length}
          label="Открытых предписаний"
          tone={openPrescriptions.length > 0 ? T.colors.warning : undefined}
          onPress={() => navigation.navigate('Control')}
        />
      </View>

      {pendingReports.length > 0 ? (
        <TouchableOpacity
          style={styles.pendingRow}
          onPress={() => navigation.navigate('SyncStatus')}
          activeOpacity={0.8}
        >
          <Icon name="cloud-upload-outline" size={18} color={T.colors.primary} />
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
            style={styles.actionBtn}
            onPress={() => navigation.navigate(a.route, a.params)}
            activeOpacity={0.75}
          >
            <View style={styles.actionIcon}>
              <Icon name={a.icon} size={22} color={T.colors.primary} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={2}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Мои объекты</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + T.spacing.sm }]}>
        <View style={styles.headerLeft}>
          <BrandWordmark fontSize={26} />
          <Text style={styles.account}>{getAccountSubtitle(contractorName, role)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          style={styles.profileBtn}
          activeOpacity={0.75}
        >
          <Icon name="account-circle-outline" size={24} color={T.colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredProjects}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => onRefresh()}
            tintColor={T.colors.primary}
          />
        }
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('Tasks', { projectId: item.id })}>
            <View style={styles.projectTop}>
              <View style={styles.projectIcon}>
                <Icon name="office-building-outline" size={20} color={T.colors.primary} />
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
              <Badge tone={{ bg: T.colors.successSoft, text: T.colors.success }}>Активный</Badge>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="office-building-outline"
            title="Объектов нет"
            text="Организация ещё не привязана к объектам строительства, либо данные не синхронизированы."
            actionLabel="Проверить синхронизацию"
            onAction={() => navigation.navigate('SyncStatus')}
          />
        }
      />
    </View>
  );
}

export default enhance(DashboardScreen);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: T.spacing.xl,
    paddingBottom: T.spacing.lg,
  },
  headerLeft: { flex: 1 },
  account: { ...T.font.small, color: T.colors.textMuted, marginTop: 2, fontWeight: '600' },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl, flexGrow: 1 },

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

  statsRow: { flexDirection: 'row', gap: T.spacing.sm, marginBottom: T.spacing.md },

  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.primarySoft,
    marginBottom: T.spacing.md,
  },
  pendingText: { ...T.font.small, fontWeight: '600', color: T.colors.primary, flex: 1 },

  sectionTitle: {
    ...T.font.overline,
    color: T.colors.textSecondary,
    marginTop: T.spacing.md,
    marginBottom: T.spacing.md,
  },

  actionsRow: { flexDirection: 'row', gap: T.spacing.sm },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: T.spacing.xs,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...T.font.caption,
    color: T.colors.textSecondary,
    textAlign: 'center',
    fontSize: 10.5,
  },

  projectTop: { flexDirection: 'row', alignItems: 'center', gap: T.spacing.md },
  projectIcon: {
    width: 40,
    height: 40,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectBody: { flex: 1 },
  projectName: { ...T.font.bodyStrong, color: T.colors.textPrimary, lineHeight: 20 },
  projectMeta: { ...T.font.caption, color: T.colors.textMuted, marginTop: 2 },
  projectFooter: { flexDirection: 'row', marginTop: T.spacing.md },
});
