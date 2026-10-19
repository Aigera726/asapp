import { useTranslation } from '@/i18n';

import { LOCALES } from '@/i18n/work';
import React, { useState } from 'react';
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
import { syncDatabase, SYNCED_TABLES } from '@/database/sync';
import { ScreenHeader } from '@/components/ui';
import Report from '@/database/models/Report';
import PurchaseRequest from '@/database/models/PurchaseRequest';
import { T } from '@/theme';
import { getStatusLabel } from '@/lib/statusLabels';

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
      Alert.alert(
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
      Alert.alert(
        force ? t("ui.full_download_completed") : t("ui.synchronization_completed"),
        t("ui.all_data_updated_successfully")
      );
    } catch (err: any) {
      console.error('[SyncScreen] Error:', err);
      Alert.alert(t("home.syncErrorTitle"), err.message ?? t("ui.please_try_again"));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReset = async () => {
    Alert.alert(
      t("ui.reset_local_database"),
      t("ui.this_removes_all_local_data_and_downloads_it_again"),
      [
        { text: t("common.cancel"), style: 'cancel' },
        {
          text: t("ui.reset"),
          style: 'destructive',
          onPress: async () => {
            setIsSyncing(true);
            try {
              // Reset database to empty state
              await database.write(async () => {
                // Список берём из слоя синхронизации, а не дублируем здесь:
                // раньше он расходился с реальным набором таблиц, и часть
                // данных переживала «полный сброс».
                for (const table of SYNCED_TABLES) {
                  const collection = (database as any).get(table);
                  const records = await collection.query().fetch();
                  for (const record of records) {
                    await record.destroyPermanently();
                  }
                }
              });

              // Force full sync
              await syncDatabase(true);
              
              setLastSyncTime(new Date().toLocaleTimeString(LOCALES[language]));
              Alert.alert(t("ui.database_restored"), t("ui.all_data_reloaded"));
            } catch (err: any) {
              console.error('[Reset] Error:', err);
              Alert.alert(t("common.error"), err.message ?? t("ui.could_not_reset_the_local_database"));
            } finally {
              setIsSyncing(false);
            }
          },
        },
      ]
    );
  };

  const renderReport = ({ item }: { item: Report; index: number }) => (
    <View style={styles.reportRow} key={item.id}>
      <View style={styles.reportDot} />
      <View style={styles.reportInfo}>
        <Text style={styles.reportId}>{t("ui.report")}{item.id.slice(0, 8)}</Text>
        <Text style={styles.reportQty}>{item.reportedQuantity}{' '}{t("ui.units")}{' '}{getStatusLabel(item.status, language)}</Text>
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
