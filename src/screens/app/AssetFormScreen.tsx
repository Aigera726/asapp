import React, { useState } from 'react';
import { ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { T } from '@/theme';
import { ScreenHeader, Field, TextField, Choice, PrimaryButton } from '@/components/ui';
import { ProjectPicker, useProjects } from '@/components/ProjectPicker';
import { ASSET_KINDS, ASSET_STATUS_LABELS } from '@/lib/domain';
import { createLocalRecord } from '@/lib/records';

const KIND_OPTIONS = ASSET_KINDS.map((k) => ({ value: k.value, label: k.label }));
const STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS)
  // Списанное/утерянное нельзя выбрать при создании — это результат движения
  .filter(([v]) => v === 'IDLE' || v === 'IN_USE' || v === 'REPAIR')
  .map(([value, label]) => ({ value, label }));

/** Постановка на учёт техники, оборудования или инструмента. */
export default function AssetFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projects = useProjects();

  const [kind, setKind] = useState<string>(route.params?.kind ?? 'TOOL');
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [inventoryNumber, setInventoryNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [holderName, setHolderName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Ошибка', 'Укажите наименование');
      return;
    }

    setSaving(true);
    try {
      await createLocalRecord('assets', (r) => {
        r.kind = kind;
        r.name = name.trim();
        r.model = model.trim() || null;
        r.inventoryNumber = inventoryNumber.trim() || null;
        r.serialNumber = serialNumber.trim() || null;
        r.status = status;
        r.projectId = projectId;
        r.holderName = holderName.trim() || null;
      });
      navigation.goBack();
    } catch (err: any) {
      console.error('[AssetForm] Ошибка сохранения:', err);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Постановка на учёт" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Тип" required>
          <Choice options={KIND_OPTIONS} value={kind} onChange={setKind} />
        </Field>

        <Field label="Наименование" required>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={kind === 'MACHINERY' ? 'Экскаватор' : 'Перфоратор'}
          />
        </Field>

        <Field label="Модель">
          <TextField value={model} onChangeText={setModel} placeholder="Caterpillar 320D" />
        </Field>

        <Field label="Инвентарный номер">
          <TextField value={inventoryNumber} onChangeText={setInventoryNumber} placeholder="ИНВ-0001" />
        </Field>

        <Field label="Серийный номер">
          <TextField value={serialNumber} onChangeText={setSerialNumber} placeholder="SN-…" />
        </Field>

        <Field label="Состояние" required>
          <Choice options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </Field>

        <Field label="Объект" hint="Где сейчас находится единица учёта">
          <ProjectPicker
            projects={projects}
            value={projectId}
            onChange={setProjectId}
            placeholder="Не привязано к объекту"
          />
        </Field>

        <Field label="Ответственный">
          <TextField value={holderName} onChangeText={setHolderName} placeholder="ФИО" />
        </Field>

        <PrimaryButton
          label="Поставить на учёт"
          icon="content-save-outline"
          onPress={handleSave}
          loading={saving}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl * 2 },
});
