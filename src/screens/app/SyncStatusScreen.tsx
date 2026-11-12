import { useTranslation } from '@/i18n';

import { LOCALES } from '@/i18n/work';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import { useNavigation } from '@react-navigation/native';
import { syncDatabase, resetCacheSafely } from '@/database/sync';
import { PendingLocalDataError } from '@/database/safe-reset';
import { ScreenHeader } from '@/components/ui';
import Report from '@/database/models/Report';
import PurchaseRequest from '@/database/models/PurchaseRequest';
import { T } from '@/theme';
import { getStatusLabel } from '@/lib/statusLabels';
import { useSyncStore } from '@/store/syncStore';
import { deliveryMessage } from '@/i18n/delivery';
import { notify } from '@/lib/alert';
import WorkAssignment from '@/database/models/WorkAssignment';
import EstimateWork from '@/database/models/EstimateWork';
import { useAssignmentTexts } from '@/hooks/useAssignmentTexts';
import { localizedValue } from '@/lib/assignment-texts';
import { displayQty, unitLabel } from '@/i18n/work';
import type { RefusalCode } from '@/lib/report-refusals';
import type { TranslationKey } from '@/i18n/messages';

const REFUSAL_TEXT: Record<RefusalCode, TranslationKey> = {
  overLimit: 'delivery.overLimit', addendum: 'delivery.addendum', assignment: 'delivery.assignment', write: 'delivery.refusedWrite',
};
type WorkLabel = { name: string; unit: string | null };

// Fix 1.4: _status is a WatermelonDB internal meta-field that cannot be used
// with Q.where(). Fetch all purchase_requests reactively and filter in JS.
const enhance = withObservables([], () => ({
  pendingReports: database.collections
    .get<Report>('reports')
    .query(Q.where('sync_status', Q.oneOf(['pending_sync', 'draft']))),
  syncedReports: database.collections
    .get<Report>('reports')
    .query(Q.where('sync_status', 'synced')),
  allRequests: database.collections
    .get<PurchaseRequest>('purchase_requests')
    .query(),
}));

interface Props {
  pendingReports: Report[];
  syncedReports: Report[];
  allRequests: PurchaseRequest[];
}

function SyncStatusScreen({ pendingReports, syncedReports, allRequests }: Props) {
  const { language, t } = useTranslation();
  const issues = useSyncStore(state => state.issues);
  const refusals = useSyncStore(state => state.refusals);
  // Название и единица работы отчёта — вместо технического номера.
  const [works, setWorks] = useState<Record<string, WorkLabel>>({});
  const assignmentIds = [...new Set(pendingReports.map(r => r.assignmentId))];
  const { texts } = useAssignmentTexts(assignmentIds);
  const pendingKey = pendingReports.map(r => r.id).join(',');
  useEffect(() => {
    // Отказ хранится, пока отчёт на телефоне; принятые и удалённые отчёты забываются.
    useSyncStore.getState().keepRefusals(pendingReports.map(r => r.id));
    let alive = true;
    (async () => {
      const ids = [...new Set(pendingReports.map(r => r.assignmentId))];
      if (!ids.length) { if (alive) setWorks({}); return; }
      const assignments = await database.get<WorkAssignment>('work_assignments').query(Q.where('id', Q.oneOf(ids))).fetch().catch(() => [] as WorkAssignment[]);
      const workIds = assignments.map(a => a.estimateWorkId).filter(Boolean) as string[];
      const estimate = workIds.length ? await database.get<EstimateWork>('estimate_works').query(Q.where('id', Q.oneOf(workIds))).fetch().catch(() => [] as EstimateWork[]) : [];
      const byWork = new Map(estimate.map(w => [w.id, w]));
      const out: Record<string, WorkLabel> = {};
      for (const a of assignments) { const w = a.estimateWorkId ? byWork.get(a.estimateWorkId) : undefined; out[a.id] = { name: w?.name || '', unit: w?.unit || null }; }
      if (alive) setWorks(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);
  const workName = (assignmentId: string) => localizedValue(texts.works[assignmentId]?.names, language, works[assignmentId]?.name || t('delivery.unknownWork'));
  const workUnit = (assignmentId: string) => unitLabel(localizedValue(texts.works[assignmentId]?.units, language, works[assignmentId]?.unit || ''), language);
  const reportName = (id: string) => { const r = pendingReports.find(x => x.id === id); return r ? workName(r.assignmentId) : id.slice(0, 8); };
  const refused = pendingReports.filter(r => refusals[r.id]);

  // Удалить отклонённый отчёт с телефона (на сервер он не попал); «Внести заново» — сразу открыть форму этой работы.
  const removeReport = async (report: Report, redo: boolean) => {
    const run = async () => {
      try {
        await database.write(async () => {
          const record = await database.get<Report>('reports').find(report.id);
          if ((record._raw as any)._status === 'created') await record.destroyPermanently();
          else await record.markAsDeleted();
        });
        useSyncStore.getState().forgetRefusals([report.id]);
        if (redo) navigation.navigate('ReportForm', { assignmentId: report.assignmentId, workName: workName(report.assignmentId), unit: works[report.assignmentId]?.unit || undefined });
        else notify(t('delivery.delete'), t('delivery.deleted'));
      } catch (err: any) {
        notify(t('common.error'), err?.message || t('ui.please_try_again'));
      }
    };
    const title = redo ? t('delivery.redo') : t('delivery.delete'), message = t('delivery.deleteConfirm');
    if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${message}`)) await run(); }
    else Alert.alert(title, message, [{ text: t('common.cancel'), style: 'cancel' }, { text: title, style: 'destructive', onPress: run }]);
  };
  const syncLabel = (status: string) => status === 'pending_sync' ? t('history.local')
    : status === 'draft' ? t('ui.draft') : status === 'synced' ? t('ui.synchronized') : status;
  const navigation = useNavigation<any>();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Fix 1.4: Filter using JS since _status is not a queryable column in WatermelonDB
  const pendingRequests = allRequests.filter(r => {
    const status = (r as any)._raw._status;
    return status === 'created' || status === 'updated';
  });
  const syncedRequests = allRequests.filter(r => (r as any)._raw._status === 'synced');

  const totalPending = pendingReports.length + pendingRequests.length;
  const totalSynced = syncedReports.length + syncedRequests.length;

  const handleSync = async (force: boolean = false) => {
    if (isSyncing) return;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      notify(
        t("ui.no_connection"),
        t("ui.synchronization_is_unavailable_data_will_be_sent_when_the")
      );
      return;
    }

    setIsSyncing(true);
    try {
      // Fix 2.8: Removed redundant post-sync database.write that re-marked reports
      // as synced — WatermelonDB handles this automatically after pushChanges.
      await syncDatabase(force);

      setLastSyncTime(new Date().toLocaleTimeString(LOCALES[language]));
      notify(
        force ? t("ui.full_download_completed") : t("ui.synchronization_completed"),
        t("ui.all_data_updated_successfully")
      );
    } catch (err: any) {
      console.error('[SyncScreen] Error:', err);
      notify(t("home.syncErrorTitle"), deliveryMessage(err, language) || err.message || t("ui.please_try_again"));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReset = async () => {
    if (isSyncing) return;
    const performReset = async () => {
      setIsSyncing(true);
      try {
        await resetCacheSafely();
        setLastSyncTime(new Date().toLocaleTimeString(LOCALES[language]));
        notify(t('ui.database_restored'), t('ui.all_data_reloaded'));
      } catch (err: any) {
        console.error('[Reset] Error:', err);
        notify(t('common.error'), err instanceof PendingLocalDataError
          ? t('delivery.resetBlocked', { count: err.count })
          : deliveryMessage(err, language) || err.message || t('ui.could_not_reset_the_local_database'));
      } finally {
        setIsSyncing(false);
      }
    };
    const title = t('ui.reset_local_database'), message = t('ui.this_removes_all_local_data_and_downloads_it_again');
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) await performReset();
    } else {
      Alert.alert(title, message, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('ui.reset'), style: 'destructive', onPress: performReset },
      ]);
    }
  };

  const renderReport = ({ item }: { item: Report; index: number }) => (
    <View style={styles.reportRow} key={item.id}>
      <View style={styles.reportDot} />
      <View style={styles.reportInfo}>
        <Text style={styles.reportId} numberOfLines={2}>{workName(item.assignmentId)}</Text>
        <Text style={styles.reportQty}>{displayQty(item.reportedQuantity, language)}{' '}{workUnit(item.assignmentId) || t("ui.units")}{' · '}{refusals[item.id] ? t('delivery.refusedWrite') : getStatusLabel(item.status, language)}</Text>
      </View>
      <View style={[
        styles.syncBadge,
        item.reportSyncStatus === 'pending_sync' && styles.syncBadgePending,
        item.reportSyncStatus === 'draft' && styles.syncBadgeDraft,
      ]}>
        <Text style={styles.syncBadgeText}>{syncLabel(item.reportSyncStatus)}</Text>
      </View>
    </View>
  );

  const renderRequest = ({ item }: { item: PurchaseRequest; index: number }) => (
    <View style={styles.reportRow} key={item.id}>
      <View style={[styles.reportDot, { backgroundColor: T.colors.info }]} />
      <View style={styles.reportInfo}>
        <Text style={styles.reportId}>{t("ui.request")}{item.requestNumber || item.id.slice(0, 8)}</Text>
        <Text style={styles.reportQty}>{item.comment || t("ui.no_comment")}</Text>
      </View>
      <View style={[styles.syncBadge, styles.syncBadgePending]}>
        <Text style={styles.syncBadgeText}>{t('history.local')}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Экран открывается из «Ещё» и раньше не имел выхода: системной
          кнопки на iOS нет, а жест назад в стеке без заголовка не работал —
          пользователь оставался запертым на странице синхронизации. */}
      <ScreenHeader
        title={t("ui.synchronization")}
        subtitle={lastSyncTime ? t("ui.last_value", { p0: lastSyncTime }) : undefined}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {issues.length > 0 && <View accessibilityLiveRegion="polite" style={{ padding: 16, marginBottom: 16, backgroundColor: T.colors.warningSoft, borderRadius: 12 }}>
          <Text style={{ color: T.colors.textPrimary, fontWeight: '700' }}>{t('delivery.remaining', { count: issues.length })}</Text>
          {issues.filter(issue => !refusals[issue.id]).map(issue => <Text key={`${issue.table}:${issue.id}`} style={{ marginTop: 8, color: T.colors.textPrimary }}>
            {issue.table === 'reports' ? reportName(issue.id) : issue.id.slice(0, 8)} · {t(`delivery.${issue.code}`)}
          </Text>)}
        </View>}

        {refused.length > 0 && <View accessibilityLiveRegion="polite" style={styles.refusedBox}>
          <Text style={styles.refusedTitle}>{t('delivery.refusedTitle', { count: refused.length })}</Text>
          <Text style={styles.refusedHint}>{t('delivery.refusedHint')}</Text>
          {refused.map(report => { const refusal = refusals[report.id];
            return <View key={report.id} style={styles.refusedItem}>
              <Text style={styles.reportId} numberOfLines={3}>{workName(report.assignmentId)}</Text>
              <Text style={styles.reportQty}>{displayQty(report.reportedQuantity, language)} {workUnit(report.assignmentId)}
                {report.createdAt ? ` · ${report.createdAt.toLocaleDateString(LOCALES[language])}` : ''}</Text>
              <Text style={styles.refusedReason}>{t(REFUSAL_TEXT[refusal.code])}</Text>
              {!!refusal.detail && refusal.code !== 'addendum' && <Text style={styles.reportQty}>{t('delivery.serverAnswer', { text: refusal.detail })}</Text>}
              <View style={styles.refusedActions}>
                <TouchableOpacity accessibilityRole="button" style={styles.refusedBtn} disabled={isSyncing} onPress={() => removeReport(report, true)}>
                  <Text style={styles.refusedBtnText}>{t('delivery.redo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" style={[styles.refusedBtn, styles.refusedBtnDanger]} disabled={isSyncing} onPress={() => removeReport(report, false)}>
                  <Text style={[styles.refusedBtnText, { color: T.colors.danger }]}>{t('delivery.delete')}</Text>
                </TouchableOpacity>
              </View>
            </View>; })}
        </View>}

        {/* Статистика */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardPending]}>
            <Text style={[styles.statNum, { color: T.colors.warning }]}>{totalPending}</Text>
            <Text style={styles.statLabel}>{t("ui.awaiting_upload")}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardSynced]}>
            <Text style={[styles.statNum, { color: T.colors.success }]}>{totalSynced}</Text>
            <Text style={styles.statLabel}>{t("ui.synchronized")}</Text>
          </View>
        </View>

        {/* Sync Buttons */}
        <View style={styles.btnColumn}>
          <TouchableOpacity
            style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
            onPress={() => handleSync(false)}
            disabled={isSyncing}
            activeOpacity={0.8}
          >
            {isSyncing ? (
              <View style={styles.syncingRow}>
                <ActivityIndicator color={T.colors.white} size="small" />
                <Text style={styles.syncBtnText}>{t("ui.synchronizing")}</Text>
              </View>
            ) : (
              <Text style={styles.syncBtnText}>{t("ui.synchronize")}{' '}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.forceBtn, isSyncing && styles.syncBtnDisabled]}
            onPress={() => handleSync(true)}
            disabled={isSyncing}
            activeOpacity={0.8}
          >
            <Text style={styles.forceBtnText}>{t("ui.download_everything_again")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.resetBtn, isSyncing && styles.syncBtnDisabled]}
            onPress={handleReset}
            disabled={isSyncing}
            activeOpacity={0.8}
          >
            <Text style={styles.resetBtnText}>{t("ui.reset_local_database_and_reload")}</Text>
          </TouchableOpacity>
        </View>

        {/* Pending list */}
        {totalPending > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>{t("ui.awaiting_upload")}</Text>
            {pendingReports.map((item, index) => renderReport({ item, index }))}
            {pendingRequests.map((item, index) => renderRequest({ item, index }))}
          </View>
        )}

        {/* Sync explanation */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t("ui.how_synchronization_works")}</Text>
          <Text style={styles.infoText}>{t("ui.all_data_is_first_saved")}{' '}<Text style={styles.infoHighlight}>{t("ui.locally")}</Text> (WatermelonDB).
            {'\n\n'}{t("ui.when_online_data_is_sent_to")}{' '}<Text style={styles.infoHighlight}>Supabase</Text>.
            {'\n\n'}{t("ui.after_a_successful_upload_the_status_changes_to")}{' '}<Text style={[styles.infoHighlight, { color: T.colors.success }]}>{t('ui.synchronized')}</Text>.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center',
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  scrollContent: {
    // Верхний отступ теперь даёт ScreenHeader — прежние 56px уводили
    // содержимое вниз и оставляли под шапкой пустую полосу.
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: T.colors.textPrimary,
    marginBottom: 4,
  },
  lastSync: {
    fontSize: 13,
    color: T.colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: T.colors.surface,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  statCardPending: {
    borderColor: T.colors.warningBorder,
    backgroundColor: T.colors.warningSoft,
  },
  statCardSynced: {
    borderColor: T.colors.successBorder,
    backgroundColor: T.colors.successSoft,
  },
  statNum: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: T.colors.textSecondary,
    textAlign: 'center',
  },
  syncBtn: {
    backgroundColor: T.colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    shadowColor: T.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  btnColumn: {
    gap: 12,
    marginBottom: 28,
  },
  forceBtn: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.colors.border,
    borderStyle: 'dashed',
  },
  forceBtnText: {
    color: T.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  resetBtn: {
    backgroundColor: T.colors.danger,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 10,
    alignItems: 'center',
  },
  resetBtnText: {
    color: T.colors.textOnBrand,
    fontSize: 16,
    fontWeight: '700',
  },
  syncBtnDisabled: {
    opacity: 0.6,
  },
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncBtnText: {
    color: T.colors.textOnBrand,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: T.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: T.colors.border,
    gap: 10,
  },
  reportDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.colors.warning,
  },
  reportInfo: {
    flex: 1,
  },
  reportId: {
    fontSize: 14,
    fontWeight: '600',
    color: T.colors.textPrimary,
  },
  reportQty: {
    fontSize: 12,
    color: T.colors.textMuted,
    marginTop: 2,
  },
  syncBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: T.colors.neutralSoft,
  },
  syncBadgePending: {
    backgroundColor: T.colors.warningBorder,
  },
  syncBadgeDraft: {
    backgroundColor: T.colors.neutralSoft,
  },
  syncBadgeText: {
    fontSize: 10,
    color: T.colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },
  refusedBox: { padding: 16, marginBottom: 16, backgroundColor: T.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: T.colors.danger },
  refusedTitle: { color: T.colors.danger, fontWeight: '700', fontSize: 15 },
  refusedHint: { color: T.colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 19 },
  refusedItem: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.colors.border },
  refusedReason: { color: T.colors.textPrimary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  refusedActions: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  refusedBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: T.colors.primary },
  refusedBtnDanger: { borderColor: T.colors.danger },
  refusedBtnText: { color: T.colors.primary, fontWeight: '700', fontSize: 14 },
  infoCard: {
    backgroundColor: T.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: T.colors.textPrimary,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: T.colors.textSecondary,
    lineHeight: 22,
  },
  infoHighlight: {
    color: T.colors.primary,
    fontWeight: '700',
  },
});

export default enhance(SyncStatusScreen);
