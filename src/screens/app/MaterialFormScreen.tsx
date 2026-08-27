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

const TYPE_OPTIONS = Object.entries(MATERIAL_MOVEMENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** Оформление движения материала по складу. */
export default function MaterialFormScreen() {
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
      Alert.alert('Ошибка', 'Выберите объект');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Ошибка', 'Укажите наименование материала');
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert('Ошибка', 'Количество должно быть больше нуля');
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
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить движение');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Движение материала" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Объект" required>
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </Field>

        <Field label="Тип движения" required>
          <Choice options={TYPE_OPTIONS} value={type} onChange={setType} />
        </Field>

        <Field label="Наименование" required>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Например: Бетон B25"
            editable={!route.params?.name}
          />
        </Field>

        <View style={styles.row}>
          <View style={styles.rowGrow}>
            <Field label="Количество" required>
              <TextField
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
          <View style={styles.rowUnit}>
            <Field label="Ед. изм.">
              <TextField
                value={unit}
                onChangeText={setUnit}
                placeholder="м³"
                editable={!route.params?.unit}
              />
            </Field>
          </View>
        </View>

        {/* Явно показываем, в какую сторону изменится остаток: типов шесть,
            и путать приход с возвратом на складе легко. */}
        <Card style={styles.effectCard}>
          <Text style={styles.effectLabel}>Влияние на остаток</Text>
          <Text
            style={[
              styles.effectValue,
              { color: sign > 0 ? T.colors.success : T.colors.danger },
            ]}
          >
            {sign > 0 ? '+' : '−'} {quantity || '0'} {unit || 'ед.'}
          </Text>
        </Card>

        <Field label="Комментарий">
          <TextField
            value={comment}
            onChangeText={setComment}
            placeholder="Основание, номер накладной, кому выдано…"
            multiline
          />
        </Field>

        <PrimaryButton
          label="Сохранить движение"
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
