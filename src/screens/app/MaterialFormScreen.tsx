import { useTranslation } from '@/i18n';
import { uiLabel } from "@/i18n/ui-labels";

import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { T } from '@/theme';
import {
  ScreenHeader,
  Field,
  TextField,
  Choice,
  PrimaryButton,
  Card,
} from '@/components/ui';
import { ProjectPicker, useProjects } from '@/components/ProjectPicker';
import { MATERIAL_MOVEMENT_LABELS, MATERIAL_MOVEMENT_SIGN } from '@/lib/domain';
import { createLocalRecord } from '@/lib/records';
import { useAuthStore } from '@/store/authStore';
import { useResourceDisplay } from '@/hooks/useResourceDisplay';

const TYPE_OPTIONS = Object.entries(MATERIAL_MOVEMENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** Оформление движения материала по складу. */
export default function MaterialFormScreen() {
  const { language, t } = useTranslation();
  const display = useResourceDisplay();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuthStore();
  const projects = useProjects();

  const [projectId, setProjectId] = useState<string | null>(
    route.params?.projectId ?? (projects.length === 1 ? projects[0].id : null)
  );
  const [type, setType] = useState<string>(route.params?.type ?? 'RECEIPT');
  const [name, setName] = useState(route.params?.name ?? '');
  const [unit, setUnit] = useState(route.params?.unit ?? '');
  const [quantity, setQuantity] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const sign = MATERIAL_MOVEMENT_SIGN[type] ?? 1;

  const handleSave = async () => {
    const qty = parseFloat(quantity.replace(',', '.'));

    if (!projectId) {
      Alert.alert(t("common.error"), t("ui.select_a_site"));
      return;
    }
    if (!name.trim()) {
      Alert.alert(t("common.error"), t("ui.enter_the_material_name"));
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert(t("common.error"), t("ui.quantity_must_be_greater_than_zero"));
      return;
    }

    setSaving(true);
    try {
      // В базу всегда пишем положительное количество: знак определяется типом
      // движения (MATERIAL_MOVEMENT_SIGN). Иначе один и тот же расход мог бы
      // попасть в журнал и как -5, и как +5 с типом «списание».
      await createLocalRecord('material_movements', (r) => {
        r.projectId = projectId;
        r.resourceId = route.params?.resourceId ?? null;
        r.materialName = name.trim();
        r.unit = unit.trim() || null;
        r.type = type;
        r.quantity = qty;
        r.comment = comment.trim() || null;
        r.occurredAt = new Date();
        r.createdBy = user?.id ?? null;
      });

      navigation.goBack();
    } catch (err: any) {
      console.error('[MaterialForm] Ошибка сохранения:', err);
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_save_the_movement"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={t("ui.material_movement")} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t("work.object")} required>
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </Field>

        <Field label={t("ui.movement_type")} required>
          <Choice options={(TYPE_OPTIONS).map(option => ({ ...option, label: uiLabel(option.label, language) }))} value={type} onChange={setType} />
        </Field>

        <Field label={t("ui.name")} required>
          <TextField
            value={route.params?.name ? display.name(route.params?.resourceId, name) : name}
            onChangeText={setName}
            placeholder={t("ui.example_concrete_b25")}
            editable={!route.params?.name}
          />
        </Field>

        <View style={styles.row}>
          <View style={styles.rowGrow}>
            <Field label={t("ui.quantity")} required>
              <TextField
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
          <View style={styles.rowUnit}>
            <Field label={t("ui.unit")}>
              <TextField
                value={route.params?.unit ? display.unit(route.params?.resourceId, unit) : unit}
                onChangeText={setUnit}
                placeholder={t("units.m3")}
                editable={!route.params?.unit}
              />
            </Field>
          </View>
        </View>

        {/* Явно показываем, в какую сторону изменится остаток: типов шесть,
            и путать приход с возвратом на складе легко. */}
        <Card style={styles.effectCard}>
          <Text style={styles.effectLabel}>{t("ui.effect_on_balance")}</Text>
          <Text
            style={[
              styles.effectValue,
              { color: sign > 0 ? T.colors.success : T.colors.danger },
            ]}
          >
            {sign > 0 ? '+' : '−'} {quantity || '0'} {display.unit(route.params?.resourceId, unit)}
          </Text>
        </Card>

        <Field label={t("report.comment")}>
          <TextField
            value={comment}
            onChangeText={setComment}
            placeholder={t("ui.reference_delivery_note_number_recipient")}
            multiline
          />
        </Field>

        <PrimaryButton
          label={t("ui.save_movement")}
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
  row: { flexDirection: 'row', gap: T.spacing.md },
  rowGrow: { flex: 2 },
  rowUnit: { flex: 1 },
  effectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.colors.surfaceSunken,
  },
  effectLabel: { ...T.font.small, color: T.colors.textSecondary },
  effectValue: { ...T.font.h3 },
});
