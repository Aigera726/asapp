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
    { value: 'PRESCRIPTIONS', label: 'Предписания', count: openPrescriptions.length },
    { value: 'INSPECTIONS', label: 'Проверки', count: inspections.length },
    { value: 'DEVIATIONS', label: 'Отклонения', count: pendingDeviations.length },
  ];

  const header = (
    <>
      <ScreenHeader title="Контроль" subtitle="Технадзор и качество" large />
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
                <StatTile value={openPrescriptions.length} label="Открытых" />
                <StatTile
                  value={overdue.length}
                  label="Просрочено"
                  tone={overdue.length > 0 ? T.colors.danger : undefined}
                />
                <StatTile
                  value={prescriptions.length - openPrescriptions.length}
                  label="Закрыто"
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
                subtitle={`${item.number ? item.number + ' · ' : ''}${label(SEVERITY_LABELS, item.severity)}`}
                meta={
                  item.dueAt
                    ? `${late ? 'Просрочено с' : 'Срок'}: ${item.dueAt.toLocaleDateString('ru-RU')}`
                    : `Выдано ${formatSmartDate(item.issuedAt)}`
                }
                badge={
                  <Badge tone={toneOf(PRESCRIPTION_STATUS_TONES, item.status)}>
                    {label(PRESCRIPTION_STATUS_LABELS, item.status)}
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
              title="Предписаний нет"
              text="Предписание фиксирует нарушение и срок его устранения — с фото и проверкой исполнения."
              actionLabel="Выдать предписание"
              onAction={() => navigation.navigate('PrescriptionForm', {})}
            />
          }
        />
        {prescriptions.length > 0 ? (
          <Fab label="Предписание" onPress={() => navigation.navigate('PrescriptionForm', {})} />
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
                <StatTile value={inspections.length} label="Проверок" />
                <StatTile
                  value={inspections.filter((i) => i.result === 'PASS').length}
                  label="Соответствует"
                  tone={T.colors.success}
                />
                <StatTile
                  value={failed}
                  label="Нарушений"
                  tone={failed > 0 ? T.colors.danger : undefined}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ListRow
              icon="clipboard-search-outline"
              title={item.title}
              subtitle={label(INSPECTION_KIND_LABELS, item.kind)}
              meta={`${formatSmartDate(item.inspectedAt)}${item.inspectorName ? ' · ' + item.inspectorName : ''}`}
              badge={
                <Badge tone={toneOf(INSPECTION_RESULT_TONES, item.result)}>
                  {label(INSPECTION_RESULT_LABELS, item.result)}
                </Badge>
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-search-outline"
              title="Проверок нет"
              text="Входной, операционный и приёмочный контроль, а также освидетельствование скрытых работ."
              actionLabel="Провести проверку"
              onAction={() => navigation.navigate('InspectionForm', {})}
            />
          }
        />
        {inspections.length > 0 ? (
          <Fab label="Проверка" onPress={() => navigation.navigate('InspectionForm', {})} />
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
                label="На согласовании"
                tone={pendingDeviations.length > 0 ? T.colors.warning : undefined}
              />
              <StatTile
                value={deviations.filter((d) => d.status === 'APPROVED').length}
                label="Согласовано"
                tone={T.colors.success}
              />
              <StatTile
                value={deviations.filter((d) => d.status === 'REJECTED').length}
                label="Отклонено"
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListRow
            icon="source-branch"
            title={item.title}
            subtitle={`${item.number ? item.number + ' · ' : ''}${label(DEVIATION_CATEGORY_LABELS, item.category)}`}
            meta={formatSmartDate(item.requestedAt)}
            badge={
              <Badge tone={toneOf(DEVIATION_STATUS_TONES, item.status)}>
                {label(DEVIATION_STATUS_LABELS, item.status)}
              </Badge>
            }
            onPress={() => navigation.navigate('DeviationDetail', { deviationId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="source-branch"
            title="Отклонений нет"
            text="Отступление от проекта, замена материала или технологии — с обоснованием и решением."
            actionLabel="Оформить отклонение"
            onAction={() => navigation.navigate('DeviationForm', {})}
          />
        }
      />
      {deviations.length > 0 ? (
        <Fab label="Отклонение" onPress={() => navigation.navigate('DeviationForm', {})} />
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
