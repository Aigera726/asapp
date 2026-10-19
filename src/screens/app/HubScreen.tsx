import { useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import Report from '@/database/models/Report';
import BpmTask from '@/database/models/BpmTask';
import DocumentModel from '@/database/models/Document';
import PurchaseRequest from '@/database/models/PurchaseRequest';
import { T } from '@/theme';
import { DEMO_BUILD } from '@/lib/demoBuild';
import { Icon, IconName } from '@/components/Icon';
import { ScreenHeader } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { getAccountSubtitle } from '@/lib/roleLabels';
import { seedDemoData, clearDemoData, hasDemoData } from '@/lib/demoData';

const enhance = withObservables([], () => ({
  pendingReports: database.collections
    .get<Report>('reports')
    .query(Q.where('sync_status', Q.oneOf(['pending_sync', 'draft']))),
  approvals: database.collections.get<BpmTask>('bpm_tasks').query(Q.where('status', 'PENDING')),
  documents: database.collections.get<DocumentModel>('documents').query(),
  requests: database.collections.get<PurchaseRequest>('purchase_requests').query(),
}));

interface Props {
  pendingReports: Report[];
  approvals: BpmTask[];
  documents: DocumentModel[];
  requests: PurchaseRequest[];
}

type Entry = {
  icon: IconName;
  title: string;
  subtitle: string;
  route: string;
  params?: object;
  badge?: number;
  tone?: string;
};

/**
 * Хаб остальных разделов.
 *
 * Раньше пять вкладок были заняты узкими экранами (в том числе технической
 * «Синхр.»), а закупки и приёмка были спрятаны в кнопки на дашборде. Часто
 * используемое вынесено во вкладки, остальное собрано здесь одним списком с
 * счётчиками — так видно, где есть работа, не заходя в каждый раздел.
 */
function HubScreen({ pendingReports, approvals, documents, requests }: Props) {
  const { language, t } = useTranslation();
  const navigation = useNavigation<any>();
  const { role, contractorName, isAdmin, isDemoMode, signOut } = useAuthStore();

  // Демо-данные — инструмент разработки: в релизной сборке блока нет вовсе.
  const [demoOn, setDemoOn] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    if (DEMO_BUILD) hasDemoData().then(setDemoOn);
  }, []);

  const toggleDemo = async () => {
    setDemoBusy(true);
    try {
      if (demoOn) {
        await clearDemoData();
        setDemoOn(false);
      } else {
        await seedDemoData();
        setDemoOn(true);
      }
    } catch (err: any) {
      console.error('[Demo] Ошибка:', err);
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_change_demo_data"));
    } finally {
      setDemoBusy(false);
    }
  };

  const unsignedDocs = documents.filter((d) => d.status === 'PENDING').length;

  const groups: { title: string; entries: Entry[] }[] = [
    {
      title: t("ui.procurement_and_warehouse"),
      entries: [
        {
          icon: 'cart-outline',
          title: t("home.procurement"),
          subtitle: t("ui.material_requests_and_orders"),
          route: 'ProcurementList',
          badge: requests.length,
        },
        {
          icon: 'truck-delivery-outline',
          title: t("ui.delivery_acceptance"),
          subtitle: t("ui.incoming_delivery_inspection"),
          route: 'AcceptanceList',
        },
      ],
    },
    {
      title: t("ui.documents"),
      entries: [
        {
          icon: 'file-document-multiple-outline',
          title: t("ui.documents"),
          subtitle: t("ui.acts_and_digital_signing"),
          route: 'DocumentsTab',
          badge: unsignedDocs,
          tone: T.colors.warning,
        },
        {
          icon: 'draw-pen',
          title: t("ui.approval"),
          subtitle: t("ui.tasks_awaiting_a_decision"),
          route: 'ApprovalsTab',
          badge: approvals.length,
          tone: T.colors.warning,
        },
      ],
    },
    // Раздел появляется только у администраторов. Признак приходит с сервера
    // (mobile.is_admin), а сами функции admin_* проверяют права ещё раз —
    // скрытый пункт меню не является защитой.
    ...(isAdmin
      ? [
          {
            title: t("ui.administration"),
            entries: [
              {
                icon: 'account-key-outline' as IconName,
                title: t("ui.access_management"),
                subtitle: t("ui.contractor_requests_and_organization_assignment"),
                route: 'AdminAccess',
              },
            ],
          },
        ]
      : []),
    {
      title: t("ui.system"),
      entries: [
        {
          icon: 'sync',
          title: t("ui.synchronization"),
          subtitle: t("ui.data_exchange_with_the_server"),
          route: 'SyncStatus',
          badge: pendingReports.length,
          tone: T.colors.warning,
        },
        {
          icon: 'account-cog-outline',
          title: t("ui.profile_and_settings"),
          subtitle: t("ui.account_details_server_sign_out"),
          route: 'Profile',
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("nav.Hub")} subtitle={isDemoMode ? t('home.demo') : getAccountSubtitle(contractorName, role, language)} large />

      <ScrollView contentContainerStyle={styles.content}>
        {groups.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            <View style={styles.groupBody}>
              {g.entries.map((e, i) => (
                <TouchableOpacity
                  key={e.route + e.title}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                  onPress={() => navigation.navigate(e.route, e.params)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowIcon}>
                    <Icon name={e.icon} size={20} color={T.colors.primary} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{e.title}</Text>
                    <Text style={styles.rowSubtitle}>{e.subtitle}</Text>
                  </View>
                  {e.badge ? (
                    <View style={[styles.badge, e.tone ? { backgroundColor: e.tone } : null]}>
                      <Text style={styles.badgeText}>{e.badge}</Text>
                    </View>
                  ) : null}
                  <Icon name="chevron-right" size={20} color={T.colors.textDisabled} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {DEMO_BUILD ? (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>{t("ui.development")}</Text>
            <View style={styles.groupBody}>
              <TouchableOpacity
                style={styles.row}
                onPress={toggleDemo}
                disabled={demoBusy}
                activeOpacity={0.7}
              >
                <View style={[styles.rowIcon, demoOn && styles.rowIconActive]}>
                  {demoBusy ? (
                    <ActivityIndicator size="small" color={T.colors.primary} />
                  ) : (
                    <Icon
                      name={demoOn ? 'database-remove-outline' : 'database-plus-outline'}
                      size={20}
                      color={demoOn ? T.colors.warning : T.colors.primary}
                    />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>
                    {demoOn ? t("ui.remove_demo_data") : t("ui.load_demo_data")}
                  </Text>
                  <Text style={styles.rowSubtitle}>
                    {demoOn
                      ? t("ui.demo_records_will_be_removed_work_data_will_be")
                      : t("ui.sites_stock_machinery_inspections_notices_and_deviations")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            {demoOn ? (
              <Text style={styles.demoNote}>{t("ui.demo_records_are_marked_and_are_never_sent_to")}{' '}</Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.8}>
          <Icon name="logout" size={18} color={T.colors.danger} />
          <Text style={styles.signOutText}>{t("onboarding.signOut")}</Text>
        </TouchableOpacity>

        <Text style={styles.version}>AS-APP · AS Group</Text>
      </ScrollView>
    </View>
  );
}

export default enhance(HubScreen);

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center', flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl },
  group: { marginBottom: T.spacing.xxl },
  groupTitle: {
    ...T.font.overline,
    color: T.colors.textSecondary,
    marginBottom: T.spacing.sm,
  },
  groupBody: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    overflow: 'hidden',
    ...T.shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.md,
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.md + 2,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: T.colors.border },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconActive: { backgroundColor: T.colors.warningSoft },
  rowBody: { flex: 1 },
  rowTitle: { ...T.font.bodyStrong, color: T.colors.textPrimary },
  rowSubtitle: { ...T.font.caption, color: T.colors.textMuted, marginTop: 1 },
  badge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: T.radius.pill,
    backgroundColor: T.colors.primary,
    alignItems: 'center',
  },
  badgeText: { ...T.font.caption, fontSize: 10.5, color: T.colors.textOnBrand },
  demoNote: {
    ...T.font.caption,
    color: T.colors.textMuted,
    marginTop: T.spacing.sm,
    paddingHorizontal: T.spacing.xs,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    paddingVertical: T.spacing.lg,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.dangerSoft,
    borderWidth: 1,
    borderColor: T.colors.dangerBorder,
  },
  signOutText: { ...T.font.bodyStrong, color: T.colors.danger },
  version: {
    ...T.font.caption,
    color: T.colors.textDisabled,
    textAlign: 'center',
    marginTop: T.spacing.xl,
  },
});
