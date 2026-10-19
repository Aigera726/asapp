import { useTranslation } from '@/i18n';
import { uiLabel } from "@/i18n/ui-labels";

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
  const { language, t } = useTranslation();
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
      Alert.alert(t("common.error"), t("ui.enter_a_name"));
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
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={t("ui.register_an_asset")} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t("ui.type")} required>
          <Choice options={(KIND_OPTIONS).map(option => ({ ...option, label: uiLabel(option.label, language) }))} value={kind} onChange={setKind} />
        </Field>

        <Field label={t("ui.name")} required>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={kind === 'MACHINERY' ? t("ui.excavator") : t("ui.rotary_hammer")}
          />
        </Field>

        <Field label={t("ui.model")}>
          <TextField value={model} onChangeText={setModel} placeholder="Caterpillar 320D" />
        </Field>

        <Field label={t("ui.inventory_number")}>
          <TextField value={inventoryNumber} onChangeText={setInventoryNumber} placeholder={t("ui.inv_0001")} />
        </Field>

        <Field label={t("ui.serial_number")}>
          <TextField value={serialNumber} onChangeText={setSerialNumber} placeholder="SN-…" />
        </Field>

        <Field label={t("ui.condition")} required>
          <Choice options={(STATUS_OPTIONS).map(option => ({ ...option, label: uiLabel(option.label, language) }))} value={status} onChange={setStatus} />
        </Field>

        <Field label={t("work.object")} hint={t("ui.current_asset_location")}>
          <ProjectPicker
            projects={projects}
            value={projectId}
            onChange={setProjectId}
            placeholder={t("ui.not_linked_to_a_site")}
          />
        </Field>

        <Field label={t("ui.responsible_person")}>
          <TextField value={holderName} onChangeText={setHolderName} placeholder={t("ui.full_name")} />
        </Field>

        <PrimaryButton
          label={t("ui.register_asset")}
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
