import { useTranslation } from '@/i18n';
import { uiLabel } from "@/i18n/ui-labels";

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { T } from '@/theme';
import { ScreenHeader, Field, TextField, Choice, PrimaryButton } from '@/components/ui';
import { ProjectPicker, useProjects } from '@/components/ProjectPicker';
import { DEVIATION_CATEGORY_LABELS } from '@/lib/domain';
import { createLocalRecord } from '@/lib/records';
import { useAuthStore } from '@/store/authStore';

const CATEGORY_OPTIONS = Object.entries(DEVIATION_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

/** Запрос на техническое отклонение от проекта. */
export default function DeviationFormScreen() {
  const { language, t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuthStore();
  const projects = useProjects();

  const [projectId, setProjectId] = useState<string | null>(route.params?.projectId ?? null);
  const [category, setCategory] = useState('DESIGN');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [proposedSolution, setProposedSolution] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!projectId) {
      Alert.alert(t("common.error"), t("ui.select_a_site"));
      return;
    }
    if (!title.trim()) {
      Alert.alert(t("common.error"), t("ui.describe_the_deviation"));
      return;
    }
    if (!reason.trim()) {
      Alert.alert(t("common.error"), t("ui.provide_justification_a_deviation_cannot_be_approved_without_it"));
      return;
    }

    setSaving(true);
    try {
      await createLocalRecord('deviations', (r) => {
        r.projectId = projectId;
        r.category = category;
        r.status = 'PENDING';
        r.title = title.trim();
        r.reason = reason.trim();
        r.proposedSolution = proposedSolution.trim() || null;
        r.description = description.trim() || null;
        r.requestedBy = user?.id ?? null;
        r.requestedByName = (user?.user_metadata?.full_name as string) ?? user?.email ?? null;
        r.requestedAt = new Date();
      });
      navigation.goBack();
    } catch (err: any) {
      console.error('[DeviationForm] Ошибка сохранения:', err);
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_save_the_deviation"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t("ui.technical_deviation")} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t("work.object")} required>
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </Field>

        <Field label={t("ui.category")} required>
          <Choice options={(CATEGORY_OPTIONS).map(option => ({ ...option, label: uiLabel(option.label, language) }))} value={category} onChange={setCategory} />
        </Field>

        <Field label={t("ui.deviation_summary")} required>
          <TextField value={title} onChangeText={setTitle} placeholder={t("ui.replace_a500_rebar_with_a400")} />
        </Field>

        <Field label={t("ui.justification")} required hint={t("ui.why_following_the_design_is_impossible_or_impractical")}>
          <TextField value={reason} onChangeText={setReason} placeholder={t("ui.material_unavailable_from_the_supplier")} multiline />
        </Field>

        <Field label={t("ui.proposed_solution")}>
          <TextField
            value={proposedSolution}
            onChangeText={setProposedSolution}
            placeholder={t("ui.recalculate_bar_spacing_while_preserving_the_cross_sectional_area")}
            multiline
          />
        </Field>

        <Field label={t("ui.details")}>
          <TextField value={description} onChangeText={setDescription} placeholder={t("ui.work_area_axis_elevation")} multiline />
        </Field>

        <PrimaryButton label={t("ui.submit_for_approval")} icon="send-outline" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
});
