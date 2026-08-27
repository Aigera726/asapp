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
      Alert.alert('Ошибка', 'Выберите объект');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Укажите суть отклонения');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Ошибка', 'Укажите обоснование — без него отклонение не согласуют');
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
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить отклонение');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Техническое отклонение" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Объект" required>
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </Field>

        <Field label="Категория" required>
          <Choice options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        </Field>

        <Field label="Суть отклонения" required>
          <TextField value={title} onChangeText={setTitle} placeholder="Замена арматуры A500 на A400" />
        </Field>

        <Field label="Обоснование" required hint="Почему выполнить по проекту невозможно или нецелесообразно">
          <TextField value={reason} onChangeText={setReason} placeholder="Отсутствие материала у поставщика…" multiline />
        </Field>

        <Field label="Предлагаемое решение">
          <TextField
            value={proposedSolution}
            onChangeText={setProposedSolution}
            placeholder="Пересчёт шага стержней с сохранением площади сечения"
            multiline
          />
        </Field>

        <Field label="Подробности">
          <TextField value={description} onChangeText={setDescription} placeholder="Участок, ось, отметка…" multiline />
        </Field>

        <PrimaryButton label="Отправить на согласование" icon="send-outline" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
});
