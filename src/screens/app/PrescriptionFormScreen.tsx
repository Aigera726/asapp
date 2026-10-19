import { useTranslation } from '@/i18n';
import { uiLabel } from "@/i18n/ui-labels";

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { T } from '@/theme';
import { ScreenHeader, Field, TextField, Choice, PrimaryButton } from '@/components/ui';
import { ProjectPicker, useProjects } from '@/components/ProjectPicker';
import { SEVERITY_LABELS } from '@/lib/domain';
import { createLocalRecord } from '@/lib/records';
import { useAuthStore } from '@/store/authStore';

const SEVERITY_OPTIONS = Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }));

/** Срок устранения задаётся сдвигом в днях: календарь на стройке лишний шаг. */
const DUE_OPTIONS = [
  { value: '1', label: '1 день' },
  { value: '3', label: '3 дня' },
  { value: '7', label: 'Неделя' },
  { value: '14', label: '2 недели' },
];

export default function PrescriptionFormScreen() {
  const { language, t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user, contractorId } = useAuthStore();
  const projects = useProjects();

  const [projectId, setProjectId] = useState<string | null>(route.params?.projectId ?? null);
  const [title, setTitle] = useState(route.params?.title ?? '');
  const [description, setDescription] = useState('');
  const [requirement, setRequirement] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [dueDays, setDueDays] = useState('3');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!projectId) {
      Alert.alert(t("common.error"), t("ui.select_a_site"));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t("common.error"), t("ui.describe_the_violation"));
      return;
    }
    if (!requirement.trim()) {
      Alert.alert(t("common.error"), t("ui.specify_what_must_be_corrected"));
      return;
    }

    setSaving(true);
    try {
      const due = new Date();
      due.setDate(due.getDate() + parseInt(dueDays, 10));
      // Срок — конец рабочего дня, а не момент создания: иначе предписание,
      // выданное в 17:00, «просрочится» в 17:01 того же дня через N суток.
      due.setHours(18, 0, 0, 0);

      await createLocalRecord('prescriptions', (r) => {
        r.projectId = projectId;
        r.inspectionId = route.params?.inspectionId ?? null;
        r.contractorId = contractorId ?? null;
        r.issuedBy = user?.id ?? null;
        r.issuedByName = (user?.user_metadata?.full_name as string) ?? user?.email ?? null;
        r.severity = severity;
        r.status = 'OPEN';
        r.title = title.trim();
        r.description = description.trim() || null;
        r.requirement = requirement.trim();
        r.dueAt = due;
        r.issuedAt = new Date();
      });

      navigation.goBack();
    } catch (err: any) {
      console.error('[PrescriptionForm] Ошибка сохранения:', err);
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_save_the_notice"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t("home.prescription")} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t("work.object")} required>
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </Field>

        <Field label={t("ui.violation")} required>
          <TextField value={title} onChangeText={setTitle} placeholder={t("ui.insufficient_concrete_cover")} />
        </Field>

        <Field label={t("ui.correction_required")} required hint={t("ui.the_acceptance_criterion_for_the_correction")}>
          <TextField
            value={requirement}
            onChangeText={setRequirement}
            placeholder={t("ui.provide_30_mm_concrete_cover_as_specified_in_the")}
            multiline
          />
        </Field>

        <Field label={t("ui.severity")} required>
          <Choice options={(SEVERITY_OPTIONS).map(option => ({ ...option, label: uiLabel(option.label, language) }))} value={severity} onChange={setSeverity} />
        </Field>

        <Field label={t("ui.correction_deadline")} required>
          <Choice options={(DUE_OPTIONS).map(option => ({ ...option, label: uiLabel(option.label, language) }))} value={dueDays} onChange={setDueDays} />
        </Field>

        <Field label={t("ui.details")}>
          <TextField
            value={description}
            onChangeText={setDescription}
            placeholder={t("ui.standards_work_area_axis")}
            multiline
          />
        </Field>

        <PrimaryButton label={t("ui.issue_a_notice")} icon="clipboard-alert-outline" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
});
