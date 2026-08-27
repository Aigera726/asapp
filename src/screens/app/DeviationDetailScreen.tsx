import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import Deviation from '@/database/models/Deviation';
import { T } from '@/theme';
import {
  ScreenHeader, Card, Badge, InfoRow, Field, TextField,
  PrimaryButton, SecondaryButton, EmptyState,
} from '@/components/ui';
import {
  DEVIATION_CATEGORY_LABELS, DEVIATION_STATUS_LABELS, DEVIATION_STATUS_TONES,
  label, toneOf,
} from '@/lib/domain';
import { formatSmartDate } from '@/lib/formatDate';
import { updateLocalRecord } from '@/lib/records';
import { useAuthStore } from '@/store/authStore';

const enhance = withObservables(['deviationId'], ({ deviationId }: { deviationId: string }) => ({
  deviation: database.collections.get<Deviation>('deviations').findAndObserve(deviationId),
}));

function DeviationDetailInner({ deviation }: { deviation: Deviation }) {
  const navigation = useNavigation();
  const { role, user } = useAuthStore();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  // Решение по отклонению принимает проектная/техническая служба, а не автор.
  const canDecide =
    (role === 'PTO' || role === 'ADMIN' || role === 'ORG_ADMIN' || role === 'TECH_SUPERVISOR') &&
    deviation.requestedBy !== user?.id;

  const decide = async (status: 'APPROVED' | 'REJECTED') => {
    if (status === 'REJECTED' && !comment.trim()) {
      Alert.alert('Ошибка', 'Укажите причину отклонения');
      return;
    }
    setBusy(true);
    try {
      await updateLocalRecord(deviation, (r: any) => {
        r.status = status;
        r.decisionComment = comment.trim() || null;
        r.decidedBy = user?.id ?? null;
        r.decidedAt = new Date();
      });
      setComment('');
    } catch (err: any) {
      console.error('[Deviation] Ошибка решения:', err);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить решение');
    } finally {
      setBusy(false);
    }
  };

  const markImplemented = async () => {
    setBusy(true);
    try {
      await updateLocalRecord(deviation, (r: any) => { r.status = 'IMPLEMENTED'; });
    } catch (err: any) {
      Alert.alert('Ошибка', err?.message ?? 'Не удалось обновить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={deviation.number || 'Отклонение'}
        subtitle={label(DEVIATION_CATEGORY_LABELS, deviation.category)}
        onBack={() => navigation.goBack()}
        right={
          <Badge tone={toneOf(DEVIATION_STATUS_TONES, deviation.status)}>
            {label(DEVIATION_STATUS_LABELS, deviation.status)}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.title}>{deviation.title}</Text>
          {deviation.reason ? (
            <>
              <Text style={styles.blockLabel}>Обоснование</Text>
              <Text style={styles.blockText}>{deviation.reason}</Text>
            </>
          ) : null}
          {deviation.proposedSolution ? (
            <>
              <Text style={styles.blockLabel}>Предлагаемое решение</Text>
              <Text style={styles.blockText}>{deviation.proposedSolution}</Text>
            </>
          ) : null}
          {deviation.description ? (
            <>
              <Text style={styles.blockLabel}>Подробности</Text>
              <Text style={styles.blockText}>{deviation.description}</Text>
            </>
          ) : null}
        </Card>

        <Card>
          <InfoRow label="Запросил" value={deviation.requestedByName || '—'} />
          <InfoRow label="Создано" value={formatSmartDate(deviation.requestedAt)} />
          {deviation.decidedAt ? (
            <InfoRow label="Решение" value={formatSmartDate(deviation.decidedAt)} />
          ) : null}
        </Card>

        {deviation.decisionComment ? (
          <Card>
            <Text style={styles.blockLabel}>Комментарий к решению</Text>
            <Text style={styles.blockText}>{deviation.decisionComment}</Text>
          </Card>
        ) : null}

        {deviation.status === 'PENDING' && canDecide ? (
          <>
            <Field label="Комментарий">
              <TextField
                value={comment}
                onChangeText={setComment}
                placeholder="Условия согласования или причина отказа"
                multiline
              />
            </Field>
            <PrimaryButton
              label="Согласовать"
              icon="check-circle-outline"
              tone="success"
              onPress={() => decide('APPROVED')}
              loading={busy}
            />
            <View style={styles.gap} />
            <SecondaryButton
              label="Отклонить"
              icon="close-circle-outline"
              onPress={() => decide('REJECTED')}
            />
          </>
        ) : null}

        {deviation.status === 'PENDING' && !canDecide ? (
          <Text style={styles.waitText}>Ожидает решения технической службы</Text>
        ) : null}

        {deviation.status === 'APPROVED' ? (
          <PrimaryButton
            label="Отметить как реализованное"
            icon="check-all"
            onPress={markImplemented}
            loading={busy}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const Enhanced = enhance(DeviationDetailInner as any);

export default function DeviationDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const deviationId: string | undefined = route.params?.deviationId;

  if (!deviationId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ошибка" onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Отклонение не найдено" />
      </View>
    );
  }
  return <Enhanced deviationId={deviationId} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
  title: { ...T.font.h3, color: T.colors.textPrimary, lineHeight: 23 },
  blockLabel: {
    ...T.font.overline,
    color: T.colors.textSecondary,
    marginTop: T.spacing.lg,
    marginBottom: T.spacing.xs,
  },
  blockText: { ...T.font.body, color: T.colors.textPrimary, lineHeight: 21 },
  gap: { height: T.spacing.md },
  waitText: { ...T.font.small, color: T.colors.textMuted, textAlign: 'center' },
});
