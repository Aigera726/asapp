import { useTranslation } from '@/i18n';

import { LOCALES } from '@/i18n/work';
import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import Inspection from '@/database/models/Inspection';
import Prescription from '@/database/models/Prescription';
import Deviation from '@/database/models/Deviation';
import { T } from '@/theme';
import { ScreenHeader, Segmented, ListRow, Badge, EmptyState, Fab, StatTile } from '@/components/ui';
import {
  INSPECTION_KIND_LABELS,
  INSPECTION_RESULT_LABELS,
  INSPECTION_RESULT_TONES,
  PRESCRIPTION_OPEN_STATUSES,
  PRESCRIPTION_STATUS_LABELS,
  PRESCRIPTION_STATUS_TONES,
  DEVIATION_CATEGORY_LABELS,
  DEVIATION_STATUS_LABELS,
  DEVIATION_STATUS_TONES,
  SEVERITY_LABELS,
  isOverdue,
  label,
  toneOf,
} from '@/lib/domain';
import { formatSmartDate } from '@/lib/formatDate';

const enhance = withObservables([], () => ({
  inspections: database.collections.get<Inspection>('inspections').query(),
  prescriptions: database.collections.get<Prescription>('prescriptions').query(),
  deviations: database.collections.get<Deviation>('deviations').query(),
}));

type Tab = 'INSPECTIONS' | 'PRESCRIPTIONS' | 'DEVIATIONS';

interface Props {
  inspections: Inspection[];
  prescriptions: Prescription[];
  deviations: Deviation[];
}

/** Технадзор: проверки, предписания и технические отклонения. */
function ControlScreen({ inspections, prescriptions, deviations }: Props) {
  const { language, t } = useTranslation();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('PRESCRIPTIONS');

  const openPrescriptions = useMemo(
    () => prescriptions.filter((p) => PRESCRIPTION_OPEN_STATUSES.includes(p.status)),
    [prescriptions]
  );
  const overdue = useMemo(
    () => prescriptions.filter((p) => isOverdue(p.dueAt, p.status)),
    [prescriptions]
  );
  const pendingDeviations = useMemo(
    () => deviations.filter((d) => d.status === 'PENDING'),
    [deviations]
  );

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'PRESCRIPTIONS', label: t("ui.corrective_notices"), count: openPrescriptions.length },
    { value: 'INSPECTIONS', label: t("ui.inspections"), count: inspections.length },
    { value: 'DEVIATIONS', label: t("ui.deviations"), count: pendingDeviations.length },
  ];

  const header = (
    <>
      <ScreenHeader title={t("nav.Control")} subtitle={t("ui.technical_supervision_and_quality")} large />
      <Segmented items={tabs} value={tab} onChange={setTab} />
    </>
  );

  // ── Предписания ────────────────────────────────────────────────────────────
  if (tab === 'PRESCRIPTIONS') {
    // Просроченные — наверх: срок устранения главное, что требует внимания.
    const sorted = [...prescriptions].sort((a, b) => {
      const ao = isOverdue(a.dueAt, a.status) ? 0 : 1;
      const bo = isOverdue(b.dueAt, b.status) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b.issuedAt.getTime() - a.issuedAt.getTime();
    });

    return (
      <View style={styles.container}>
        {header}
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            prescriptions.length > 0 ? (
              <View style={styles.statsRow}>
                <StatTile value={openPrescriptions.length} label={t("ui.open")} />
                <StatTile
                  value={overdue.length}
                  label={t("ui.overdue")}
                  tone={overdue.length > 0 ? T.colors.danger : undefined}
                />
                <StatTile
                  value={prescriptions.length - openPrescriptions.length}
                  label={t("ui.closed")}
                  tone={T.colors.success}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const late = isOverdue(item.dueAt, item.status);
            return (
              <ListRow
                icon={late ? 'alert-circle-outline' : 'clipboard-alert-outline'}
                iconColor={late ? T.colors.danger : T.colors.primary}
                title={item.title}
                subtitle={`${item.number ? item.number + ' · ' : ''}${label(SEVERITY_LABELS, item.severity, language)}`}
                meta={
                  item.dueAt
                    ? `${late ? t("ui.overdue_since") : t("ui.due_date")}: ${item.dueAt.toLocaleDateString(LOCALES[language])}`
                    : t("ui.issued_value", { p0: formatSmartDate(item.issuedAt, language) })
                }
                badge={
                  <Badge tone={toneOf(PRESCRIPTION_STATUS_TONES, item.status)}>
                    {label(PRESCRIPTION_STATUS_LABELS, item.status, language)}
                  </Badge>
                }
                danger={late}
                onPress={() => navigation.navigate('PrescriptionDetail', { prescriptionId: item.id })}
              />
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-check-outline"
              title={t("ui.no_corrective_notices")}
              text={t("ui.a_notice_records_a_violation_and_its_correction_deadline")}
              actionLabel={t("ui.issue_a_notice")}
              onAction={() => navigation.navigate('PrescriptionForm', {})}
            />
          }
        />
        {prescriptions.length > 0 ? (
          <Fab label={t("home.prescription")} onPress={() => navigation.navigate('PrescriptionForm', {})} />
        ) : null}
      </View>
    );
  }

  // ── Проверки ───────────────────────────────────────────────────────────────
  if (tab === 'INSPECTIONS') {
    const sorted = [...inspections].sort(
      (a, b) => b.inspectedAt.getTime() - a.inspectedAt.getTime()
    );
    const failed = inspections.filter((i) => i.result === 'FAIL').length;

    return (
      <View style={styles.container}>
        {header}
        <FlatList
          data={sorted}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            inspections.length > 0 ? (
              <View style={styles.statsRow}>
                <StatTile value={inspections.length} label={t("ui.inspections_02ba3")} />
                <StatTile
                  value={inspections.filter((i) => i.result === 'PASS').length}
                  label={t("ui.compliant")}
                  tone={T.colors.success}
                />
                <StatTile
                  value={failed}
                  label={t("ui.violations")}
                  tone={failed > 0 ? T.colors.danger : undefined}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ListRow
              icon="clipboard-search-outline"
              title={item.title}
              subtitle={label(INSPECTION_KIND_LABELS, item.kind, language)}
              meta={`${formatSmartDate(item.inspectedAt, language)}${item.inspectorName ? ' · ' + item.inspectorName : ''}`}
              badge={
                <Badge tone={toneOf(INSPECTION_RESULT_TONES, item.result)}>
                  {label(INSPECTION_RESULT_LABELS, item.result, language)}
                </Badge>
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-search-outline"
              title={t("ui.no_inspections")}
              text={t("ui.incoming_operational_and_acceptance_inspections_including_concealed_work_inspections")}
              actionLabel={t("ui.start_an_inspection")}
              onAction={() => navigation.navigate('InspectionForm', {})}
            />
          }
        />
        {inspections.length > 0 ? (
          <Fab label={t("home.inspection")} onPress={() => navigation.navigate('InspectionForm', {})} />
        ) : null}
      </View>
    );
  }

  // ── Технические отклонения ─────────────────────────────────────────────────
  const sorted = [...deviations].sort(
    (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()
  );

  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={sorted}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          deviations.length > 0 ? (
            <View style={styles.statsRow}>
              <StatTile
                value={pendingDeviations.length}
                label={t("ui.awaiting_approval")}
                tone={pendingDeviations.length > 0 ? T.colors.warning : undefined}
              />
              <StatTile
                value={deviations.filter((d) => d.status === 'APPROVED').length}
                label={t("ui.approved")}
                tone={T.colors.success}
              />
              <StatTile
                value={deviations.filter((d) => d.status === 'REJECTED').length}
                label={t("history.rejected")}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListRow
            icon="source-branch"
            title={item.title}
            subtitle={`${item.number ? item.number + ' · ' : ''}${label(DEVIATION_CATEGORY_LABELS, item.category, language)}`}
            meta={formatSmartDate(item.requestedAt, language)}
            badge={
              <Badge tone={toneOf(DEVIATION_STATUS_TONES, item.status)}>
                {label(DEVIATION_STATUS_LABELS, item.status, language)}
              </Badge>
            }
            onPress={() => navigation.navigate('DeviationDetail', { deviationId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="source-branch"
            title={t("ui.no_deviations")}
            text={t("ui.a_departure_from_the_design_or_a_change_of")}
            actionLabel={t("ui.register_a_deviation")}
            onAction={() => navigation.navigate('DeviationForm', {})}
          />
        }
      />
      {deviations.length > 0 ? (
        <Fab label={t("ui.deviation")} onPress={() => navigation.navigate('DeviationForm', {})} />
      ) : null}
    </View>
  );
}

export default enhance(ControlScreen);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  list: { paddingHorizontal: T.spacing.xl, paddingBottom: 96, flexGrow: 1 },
  statsRow: { flexDirection: 'row', gap: T.spacing.sm, marginBottom: T.spacing.lg },
});
