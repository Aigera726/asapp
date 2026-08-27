import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { T } from '@/theme';
import { ScreenHeader, Field, TextField, Choice, PrimaryButton } from '@/components/ui';
import { ProjectPicker, useProjects } from '@/components/ProjectPicker';
import { INSPECTION_KIND_LABELS, INSPECTION_RESULT_LABELS } from '@/lib/domain';
import { createLocalRecord } from '@/lib/records';
import { useAuthStore } from '@/store/authStore';

const KIND_OPTIONS = Object.entries(INSPECTION_KIND_LABELS).map(([value, label]) => ({ value, label }));
const RESULT_OPTIONS = Object.entries(INSPECTION_RESULT_LABELS).map(([value, label]) => ({ value, label }));

/** Проверка технадзора с фиксацией места. */
export default function InspectionFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuthStore();
  const projects = useProjects();

  const [projectId, setProjectId] = useState<string | null>(route.params?.projectId ?? null);
  const [kind, setKind] = useState('OPERATIONAL');
  const [result, setResult] = useState('PASS');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!projectId) {
      Alert.alert('Ошибка', 'Выберите объект');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Укажите, что проверялось');
      return;
    }

    setSaving(true);
    try {
      // Координаты подтверждают, что проверка выполнена на объекте.
      // Отказ в доступе не блокирует запись — поля просто останутся пустыми.
      let geoLat: number | null = null;
      let geoLon: number | null = null;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          geoLat = loc.coords.latitude;
          geoLon = loc.coords.longitude;
        }
      } catch (e) {
        console.warn('[Inspection] Геолокация недоступна', e);
      }

      const inspection: any = await createLocalRecord('inspections', (r) => {
        r.projectId = projectId;
        r.kind = kind;
        r.result = result;
        r.title = title.trim();
        r.description = description.trim() || null;
        r.inspectorId = user?.id ?? null;
        r.inspectorName = (user?.user_metadata?.full_name as string) ?? user?.email ?? null;
        r.geoLat = geoLat;
        r.geoLon = geoLon;
        r.inspectedAt = new Date();
      });

      // Нарушение без предписания остаётся просто записью в журнале —
      // предлагаем сразу оформить требование с сроком устранения.
      if (result === 'FAIL') {
        Alert.alert(
          'Зафиксировано нарушение',
          'Выдать предписание на устранение?',
          [
            { text: 'Позже', style: 'cancel', onPress: () => navigation.goBack() },
            {
              text: 'Выдать',
              onPress: () =>
                navigation.replace('PrescriptionForm', {
                  projectId,
                  inspectionId: inspection.id,
                  title: title.trim(),
                }),
            },
          ]
        );
        return;
      }

      navigation.goBack();
    } catch (err: any) {
      console.error('[InspectionForm] Ошибка сохранения:', err);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить проверку');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Проверка" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Объект" required>
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </Field>

        <Field label="Вид контроля" required>
          <Choice options={KIND_OPTIONS} value={kind} onChange={setKind} />
        </Field>

        <Field label="Что проверялось" required>
          <TextField value={title} onChangeText={setTitle} placeholder="Армирование плиты, ось 3-5" />
        </Field>

        <Field label="Результат" required>
          <Choice options={RESULT_OPTIONS} value={result} onChange={setResult} />
        </Field>

        <Field
          label="Замечания"
          hint={result === 'FAIL' ? 'После сохранения предложим выдать предписание' : undefined}
        >
          <TextField
            value={description}
            onChangeText={setDescription}
            placeholder="Описание выявленного, ссылки на нормы…"
            multiline
          />
        </Field>

        <PrimaryButton label="Сохранить проверку" icon="content-save-outline" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
});
