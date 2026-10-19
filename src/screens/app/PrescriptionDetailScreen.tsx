import { useTranslation } from '@/i18n';

import { LOCALES } from '@/i18n/work';
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
  const { language, t } = useTranslation();
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
      Alert.alert(t("common.error"), t("ui.enter_a_comment"));
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
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_update_the_notice"));
    } finally {
      setBusy(false);
    }
  };

  const status = prescription.status;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={prescription.number || t("home.prescription")}
        subtitle={label(PRESCRIPTION_STATUS_LABELS, status, language)}
        onBack={() => navigation.goBack()}
        right={
          <Badge tone={toneOf(PRESCRIPTION_STATUS_TONES, status)}>
            {label(PRESCRIPTION_STATUS_LABELS, status, language)}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {late ? (
          <Card style={styles.alert}>
            <Text style={styles.alertText}>{t("ui.correction_deadline_expired_on")}{' '}{prescription.dueAt?.toLocaleDateString('ru-RU')}
            </Text>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.title}>{prescription.title}</Text>
          <View style={styles.badgeRow}>
            <Badge tone={toneOf(SEVERITY_TONES, prescription.severity)}>
              {label(SEVERITY_LABELS, prescription.severity, language)}
            </Badge>
          </View>
          {prescription.requirement ? (
            <>
              <Text style={styles.blockLabel}>{t("ui.correction_required")}</Text>
              <Text style={styles.blockText}>{prescription.requirement}</Text>
            </>
          ) : null}
          {prescription.description ? (
            <>
              <Text style={styles.blockLabel}>{t("ui.details")}</Text>
              <Text style={styles.blockText}>{prescription.description}</Text>
            </>
          ) : null}
        </Card>

        <Card>
          <InfoRow label={t("ui.issued_by")} value={prescription.issuedByName || '—'} />
          <InfoRow label={t("ui.issued")} value={formatSmartDate(prescription.issuedAt, language)} />
          <InfoRow
            label={t("ui.due_date")}
            value={prescription.dueAt ? prescription.dueAt.toLocaleDateString(LOCALES[language]) : '—'}
          />
          {prescription.resolvedAt ? (
            <InfoRow label={t("ui.submitted_for_verification")} value={formatSmartDate(prescription.resolvedAt, language)} />
          ) : null}
          {prescription.closedAt ? (
            <InfoRow label={t("ui.closed")} value={formatSmartDate(prescription.closedAt, language)} />
          ) : null}
        </Card>

        {prescription.resolutionComment ? (
          <Card>
            <Text style={styles.blockLabel}>{t("ui.correction_report")}</Text>
            <Text style={styles.blockText}>{prescription.resolutionComment}</Text>
          </Card>
        ) : null}

        {status === 'CLOSED' || status === 'VERIFIED' ? null : (
          <>
            <Field label={t("report.comment")}>
              <TextField
                value={comment}
                onChangeText={setComment}
                placeholder={t("ui.what_was_done_why_it_was_returned")}
                multiline
              />
            </Field>

            <View style={styles.actions}>
              {status === 'OPEN' ? (
                <PrimaryButton
                  label={t("ui.start_work")}
                  icon="progress-wrench"
                  onPress={() => transition('IN_PROGRESS')}
                  loading={busy}
                />
              ) : null}

              {status === 'IN_PROGRESS' || status === 'REJECTED' ? (
                <PrimaryButton
                  label={t("ui.submit_for_verification")}
                  icon="clipboard-check-outline"
                  onPress={() => transition('SUBMITTED', { requireComment: true, stamp: 'resolved' })}
                  loading={busy}
                />
              ) : null}

              {status === 'SUBMITTED' && isSupervisor ? (
                <>
                  <PrimaryButton
                    label={t("ui.accept_correction")}
                    icon="check-circle-outline"
                    tone="success"
                    onPress={() => transition('VERIFIED', { stamp: 'closed' })}
                    loading={busy}
                  />
                  <View style={styles.gap} />
                  <SecondaryButton
                    label={t("ui.return_for_revision")}
                    icon="close-circle-outline"
                    onPress={() => transition('REJECTED', { requireComment: true })}
                  />
                </>
              ) : null}

              {status === 'SUBMITTED' && !isSupervisor ? (
                <Text style={styles.waitText}>{t("ui.awaiting_technical_supervision_verification")}</Text>
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
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const prescriptionId: string | undefined = route.params?.prescriptionId;

  if (!prescriptionId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t("common.error")} onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title={t("ui.corrective_notice_not_found")} />
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
