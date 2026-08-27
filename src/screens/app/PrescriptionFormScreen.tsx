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
      Alert.alert('Ошибка', 'Выберите объект');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Укажите суть нарушения');
      return;
    }
    if (!requirement.trim()) {
      Alert.alert('Ошибка', 'Укажите, что требуется устранить');
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
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить предписание');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Предписание" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Объект" required>
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </Field>

        <Field label="Нарушение" required>
          <TextField value={title} onChangeText={setTitle} placeholder="Отсутствует защитный слой бетона" />
        </Field>

        <Field label="Требуется устранить" required hint="Формулировка, по которой будет приниматься работа">
          <TextField
            value={requirement}
            onChangeText={setRequirement}
            placeholder="Обеспечить защитный слой 30 мм согласно проекту"
            multiline
          />
        </Field>

        <Field label="Критичность" required>
          <Choice options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} />
        </Field>

        <Field label="Срок устранения" required>
          <Choice options={DUE_OPTIONS} value={dueDays} onChange={setDueDays} />
        </Field>

        <Field label="Подробности">
          <TextField
            value={description}
            onChangeText={setDescription}
            placeholder="Ссылки на нормы, участок, ось…"
            multiline
          />
        </Field>

        <PrimaryButton label="Выдать предписание" icon="clipboard-alert-outline" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
});
