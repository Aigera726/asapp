import { useTranslation } from '@/i18n';

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
  const { language, t } = useTranslation();
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
      Alert.alert(t("common.error"), t("ui.enter_the_rejection_reason"));
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
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_save_the_decision"));
    } finally {
      setBusy(false);
    }
  };

  const markImplemented = async () => {
    setBusy(true);
    try {
      await updateLocalRecord(deviation, (r: any) => { r.status = 'IMPLEMENTED'; });
    } catch (err: any) {
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_update"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={deviation.number || t("ui.deviation")}
        subtitle={label(DEVIATION_CATEGORY_LABELS, deviation.category, language)}
        onBack={() => navigation.goBack()}
        right={
          <Badge tone={toneOf(DEVIATION_STATUS_TONES, deviation.status)}>
            {label(DEVIATION_STATUS_LABELS, deviation.status, language)}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.title}>{deviation.title}</Text>
          {deviation.reason ? (
            <>
              <Text style={styles.blockLabel}>{t("ui.justification")}</Text>
              <Text style={styles.blockText}>{deviation.reason}</Text>
            </>
          ) : null}
          {deviation.proposedSolution ? (
            <>
              <Text style={styles.blockLabel}>{t("ui.proposed_solution")}</Text>
              <Text style={styles.blockText}>{deviation.proposedSolution}</Text>
            </>
          ) : null}
          {deviation.description ? (
            <>
              <Text style={styles.blockLabel}>{t("ui.details")}</Text>
              <Text style={styles.blockText}>{deviation.description}</Text>
            </>
          ) : null}
        </Card>

        <Card>
          <InfoRow label={t("ui.requested_by")} value={deviation.requestedByName || '—'} />
          <InfoRow label={t("ui.created")} value={formatSmartDate(deviation.requestedAt, language)} />
          {deviation.decidedAt ? (
            <InfoRow label={t("ui.decision")} value={formatSmartDate(deviation.decidedAt, language)} />
          ) : null}
        </Card>

        {deviation.decisionComment ? (
          <Card>
            <Text style={styles.blockLabel}>{t("ui.decision_comment")}</Text>
            <Text style={styles.blockText}>{deviation.decisionComment}</Text>
          </Card>
        ) : null}

        {deviation.status === 'PENDING' && canDecide ? (
          <>
            <Field label={t("report.comment")}>
              <TextField
                value={comment}
                onChangeText={setComment}
                placeholder={t("ui.approval_conditions_or_reason_for_refusal")}
                multiline
              />
            </Field>
            <PrimaryButton
              label={t("ui.approve_079c0")}
              icon="check-circle-outline"
              tone="success"
              onPress={() => decide('APPROVED')}
              loading={busy}
            />
            <View style={styles.gap} />
            <SecondaryButton
              label={t("ui.reject")}
              icon="close-circle-outline"
              onPress={() => decide('REJECTED')}
            />
          </>
        ) : null}

        {deviation.status === 'PENDING' && !canDecide ? (
          <Text style={styles.waitText}>{t("ui.awaiting_the_technical_team_s_decision")}</Text>
        ) : null}

        {deviation.status === 'APPROVED' ? (
          <PrimaryButton
            label={t("ui.mark_as_implemented")}
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
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const deviationId: string | undefined = route.params?.deviationId;

  if (!deviationId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t("common.error")} onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title={t("ui.deviation_not_found")} />
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
