import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import Prescription from '@/database/models/Prescription';
import { T } from '@/theme';
import {
  ScreenHeader,
  Card,
  Badge,
  InfoRow,
  Field,
  TextField,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
} from '@/components/ui';
import {
  PRESCRIPTION_STATUS_LABELS,
  PRESCRIPTION_STATUS_TONES,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  isOverdue,
  label,
  toneOf,
} from '@/lib/domain';
import { formatSmartDate } from '@/lib/formatDate';
import { updateLocalRecord } from '@/lib/records';
import { useAuthStore } from '@/store/authStore';

const enhance = withObservables(
  ['prescriptionId'],
  ({ prescriptionId }: { prescriptionId: string }) => ({
    prescription: database.collections
      .get<Prescription>('prescriptions')
      .findAndObserve(prescriptionId),
  })
);

/**
 * Предписание с рабочим циклом.
 *
 * Кто какое действие видит, зависит от роли: подрядчик отчитывается об
 * устранении, технадзор принимает или возвращает. Раньше в приложении
 * жизненный цикл нигде не был выражен — статус можно было только смотреть.
 */
function PrescriptionDetailInner({ prescription }: { prescription: Prescription }) {
  const navigation = useNavigation();
  const { role } = useAuthStore();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const late = isOverdue(prescription.dueAt, prescription.status);
  const isSupervisor = role === 'TECH_SUPERVISOR' || role === 'ADMIN' || role === 'PTO' || role === 'ORG_ADMIN';

  const transition = async (
    status: string,
    opts: { requireComment?: boolean; stamp?: 'resolved' | 'closed' } = {}
  ) => {
    if (opts.requireComment && !comment.trim()) {
      Alert.alert('Ошибка', 'Заполните комментарий');
      return;
    }
    setBusy(true);
    try {
      await updateLocalRecord(prescription, (r: any) => {
        r.status = status;
        if (comment.trim()) r.resolutionComment = comment.trim();
        if (opts.stamp === 'resolved') r.resolvedAt = new Date();
        if (opts.stamp === 'closed') r.closedAt = new Date();
      });
      setComment('');
    } catch (err: any) {
      console.error('[Prescription] Ошибка смены статуса:', err);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось обновить предписание');
    } finally {
      setBusy(false);
    }
  };

  const status = prescription.status;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={prescription.number || 'Предписание'}
        subtitle={label(PRESCRIPTION_STATUS_LABELS, status)}
        onBack={() => navigation.goBack()}
        right={
          <Badge tone={toneOf(PRESCRIPTION_STATUS_TONES, status)}>
            {label(PRESCRIPTION_STATUS_LABELS, status)}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {late ? (
          <Card style={styles.alert}>
            <Text style={styles.alertText}>
              Срок устранения истёк {prescription.dueAt?.toLocaleDateString('ru-RU')}
            </Text>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.title}>{prescription.title}</Text>
          <View style={styles.badgeRow}>
            <Badge tone={toneOf(SEVERITY_TONES, prescription.severity)}>
              {label(SEVERITY_LABELS, prescription.severity)}
            </Badge>
          </View>
          {prescription.requirement ? (
            <>
              <Text style={styles.blockLabel}>Требуется устранить</Text>
              <Text style={styles.blockText}>{prescription.requirement}</Text>
            </>
          ) : null}
          {prescription.description ? (
            <>
              <Text style={styles.blockLabel}>Подробности</Text>
              <Text style={styles.blockText}>{prescription.description}</Text>
            </>
          ) : null}
        </Card>

        <Card>
          <InfoRow label="Выдал" value={prescription.issuedByName || '—'} />
          <InfoRow label="Выдано" value={formatSmartDate(prescription.issuedAt)} />
          <InfoRow
            label="Срок"
            value={prescription.dueAt ? prescription.dueAt.toLocaleDateString('ru-RU') : '—'}
          />
          {prescription.resolvedAt ? (
            <InfoRow label="Предъявлено" value={formatSmartDate(prescription.resolvedAt)} />
          ) : null}
          {prescription.closedAt ? (
            <InfoRow label="Закрыто" value={formatSmartDate(prescription.closedAt)} />
          ) : null}
        </Card>

        {prescription.resolutionComment ? (
          <Card>
            <Text style={styles.blockLabel}>Отчёт об устранении</Text>
            <Text style={styles.blockText}>{prescription.resolutionComment}</Text>
          </Card>
        ) : null}

        {status === 'CLOSED' || status === 'VERIFIED' ? null : (
          <>
            <Field label="Комментарий">
              <TextField
                value={comment}
                onChangeText={setComment}
                placeholder="Что сделано / почему возвращено"
                multiline
              />
            </Field>

            <View style={styles.actions}>
              {status === 'OPEN' ? (
                <PrimaryButton
                  label="Принять в работу"
                  icon="progress-wrench"
                  onPress={() => transition('IN_PROGRESS')}
                  loading={busy}
                />
              ) : null}

              {status === 'IN_PROGRESS' || status === 'REJECTED' ? (
                <PrimaryButton
                  label="Предъявить к проверке"
                  icon="clipboard-check-outline"
                  onPress={() => transition('SUBMITTED', { requireComment: true, stamp: 'resolved' })}
                  loading={busy}
                />
              ) : null}

              {status === 'SUBMITTED' && isSupervisor ? (
                <>
                  <PrimaryButton
                    label="Принять устранение"
                    icon="check-circle-outline"
                    tone="success"
                    onPress={() => transition('VERIFIED', { stamp: 'closed' })}
                    loading={busy}
                  />
                  <View style={styles.gap} />
                  <SecondaryButton
                    label="Вернуть на доработку"
                    icon="close-circle-outline"
                    onPress={() => transition('REJECTED', { requireComment: true })}
                  />
                </>
              ) : null}

              {status === 'SUBMITTED' && !isSupervisor ? (
                <Text style={styles.waitText}>Ожидает проверки технадзора</Text>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const Enhanced = enhance(PrescriptionDetailInner as any);

export default function PrescriptionDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const prescriptionId: string | undefined = route.params?.prescriptionId;

  if (!prescriptionId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ошибка" onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Предписание не найдено" />
      </View>
    );
  }
  return <Enhanced prescriptionId={prescriptionId} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
  alert: { backgroundColor: T.colors.dangerSoft, borderColor: T.colors.dangerBorder },
  alertText: { ...T.font.small, fontWeight: '700', color: T.colors.danger },
  title: { ...T.font.h3, color: T.colors.textPrimary, lineHeight: 23 },
  badgeRow: { flexDirection: 'row', marginTop: T.spacing.md },
  blockLabel: {
    ...T.font.overline,
    color: T.colors.textSecondary,
    marginTop: T.spacing.lg,
    marginBottom: T.spacing.xs,
  },
  blockText: { ...T.font.body, color: T.colors.textPrimary, lineHeight: 21 },
  actions: { marginTop: T.spacing.sm },
  gap: { height: T.spacing.md },
  waitText: { ...T.font.small, color: T.colors.textMuted, textAlign: 'center' },
});
