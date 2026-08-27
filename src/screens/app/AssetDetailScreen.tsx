import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import Asset from '@/database/models/Asset';
import AssetMovement from '@/database/models/AssetMovement';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';
import {
  ScreenHeader,
  Card,
  Badge,
  InfoRow,
  Field,
  TextField,
  Choice,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
} from '@/components/ui';
import {
  ASSET_KIND_LABELS,
  ASSET_MOVEMENT_LABELS,
  ASSET_MOVEMENT_RESULT_STATUS,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  label,
  toneOf,
} from '@/lib/domain';
import { formatSmartDate } from '@/lib/formatDate';
import { createLocalRecord, updateLocalRecord } from '@/lib/records';
import { useAuthStore } from '@/store/authStore';

const enhance = withObservables(['assetId'], ({ assetId }: { assetId: string }) => ({
  asset: database.collections.get<Asset>('assets').findAndObserve(assetId),
  movements: database.collections
    .get<AssetMovement>('asset_movements')
    .query(Q.where('asset_id', assetId)),
}));

const MOVEMENT_OPTIONS = Object.entries(ASSET_MOVEMENT_LABELS).map(([value, l]) => ({
  value,
  label: l,
}));

interface Props {
  asset: Asset;
  movements: AssetMovement[];
}

function AssetDetailInner({ asset, movements }: Props) {
  const navigation = useNavigation();
  const { user } = useAuthStore();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [type, setType] = useState('ISSUE');
  const [toHolder, setToHolder] = useState('');
  const [hours, setHours] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const history = [...movements].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()
  );
  const totalHours = movements.reduce((sum, m) => sum + (m.hours || 0), 0);

  const openSheet = (preset: string) => {
    setType(preset);
    setToHolder(preset === 'RETURN' ? '' : asset.holderName ?? '');
    setHours('');
    setComment('');
    setSheetOpen(true);
  };

  const handleSaveMovement = async () => {
    const parsedHours = hours ? parseFloat(hours.replace(',', '.')) : null;
    if (type === 'SHIFT' && (parsedHours === null || Number.isNaN(parsedHours) || parsedHours <= 0)) {
      Alert.alert('Ошибка', 'Укажите наработку за смену в часах');
      return;
    }
    if (type === 'ISSUE' && !toHolder.trim()) {
      Alert.alert('Ошибка', 'Укажите, кому выдаётся');
      return;
    }

    setSaving(true);
    try {
      await createLocalRecord('asset_movements', (r) => {
        r.assetId = asset.id;
        r.type = type;
        r.projectId = asset.projectId;
        r.fromHolder = asset.holderName ?? null;
        r.toHolder = toHolder.trim() || null;
        r.hours = parsedHours;
        r.comment = comment.trim() || null;
        r.occurredAt = new Date();
        r.createdBy = user?.id ?? null;
      });

      // Состояние единицы учёта — производное от последнего движения.
      // Держим его в самой записи, чтобы список не пересчитывал историю.
      await updateLocalRecord(asset, (r: any) => {
        r.status = ASSET_MOVEMENT_RESULT_STATUS[type] ?? asset.status;
        if (type === 'RETURN' || type === 'DECOMMISSION') {
          r.holderName = null;
        } else if (toHolder.trim()) {
          r.holderName = toHolder.trim();
        }
        if (parsedHours) {
          r.totalHours = (asset.totalHours || 0) + parsedHours;
        }
      });

      setSheetOpen(false);
    } catch (err: any) {
      console.error('[AssetDetail] Ошибка движения:', err);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить движение');
    } finally {
      setSaving(false);
    }
  };

  const isMachinery = asset.kind === 'MACHINERY';

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={asset.name}
        subtitle={label(ASSET_KIND_LABELS, asset.kind)}
        onBack={() => navigation.goBack()}
        right={
          <Badge tone={toneOf(ASSET_STATUS_TONES, asset.status)}>
            {label(ASSET_STATUS_LABELS, asset.status)}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <InfoRow label="Модель" value={asset.model || '—'} />
          <InfoRow label="Инвентарный №" value={asset.inventoryNumber || '—'} />
          <InfoRow label="Серийный №" value={asset.serialNumber || '—'} />
          <InfoRow label="Ответственный" value={asset.holderName || 'Не выдано'} />
          {isMachinery ? (
            <InfoRow
              label="Наработка"
              value={`${(asset.totalHours ?? totalHours).toFixed(1)} м/ч`}
            />
          ) : null}
        </Card>

        <Text style={styles.sectionTitle}>Действия</Text>
        <View style={styles.actions}>
          <ActionButton icon="account-arrow-right-outline" label="Выдать" onPress={() => openSheet('ISSUE')} />
          <ActionButton icon="account-arrow-left-outline" label="Принять" onPress={() => openSheet('RETURN')} />
          <ActionButton icon="wrench-outline" label="В ремонт" onPress={() => openSheet('SERVICE')} />
          {isMachinery ? (
            <ActionButton icon="clock-outline" label="Смена" onPress={() => openSheet('SHIFT')} />
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>История</Text>
        {history.length === 0 ? (
          <EmptyState icon="history" title="Движений ещё не было" />
        ) : (
          history.map((m) => (
            <Card key={m.id}>
              <View style={styles.histTop}>
                <Text style={styles.histType}>{label(ASSET_MOVEMENT_LABELS, m.type)}</Text>
                <Text style={styles.histDate}>{formatSmartDate(m.occurredAt)}</Text>
              </View>
              {m.toHolder || m.fromHolder ? (
                <Text style={styles.histWho}>
                  {m.fromHolder || '—'} → {m.toHolder || 'склад'}
                </Text>
              ) : null}
              {m.hours ? <Text style={styles.histHours}>Наработка: {m.hours} м/ч</Text> : null}
              {m.comment ? <Text style={styles.histComment}>{m.comment}</Text> : null}
            </Card>
          ))
        )}
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Новое движение</Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Icon name="close" size={22} color={T.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Field label="Тип" required>
                <Choice options={MOVEMENT_OPTIONS} value={type} onChange={setType} />
              </Field>

              {type !== 'RETURN' && type !== 'DECOMMISSION' ? (
                <Field label={type === 'TRANSFER' ? 'Куда / кому' : 'Кому'} required={type === 'ISSUE'}>
                  <TextField value={toHolder} onChangeText={setToHolder} placeholder="ФИО или участок" />
                </Field>
              ) : null}

              {type === 'SHIFT' ? (
                <Field label="Наработка за смену, м/ч" required>
                  <TextField value={hours} onChangeText={setHours} placeholder="8" keyboardType="decimal-pad" />
                </Field>
              ) : null}

              <Field label="Комментарий">
                <TextField value={comment} onChangeText={setComment} placeholder="Основание, состояние…" multiline />
              </Field>

              <PrimaryButton label="Сохранить" onPress={handleSaveMovement} loading={saving} />
              <View style={styles.sheetSpacer} />
              <SecondaryButton label="Отмена" onPress={() => setSheetOpen(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionButton({
  icon,
  label: text,
  onPress,
}: {
  icon: any;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      <Icon name={icon} size={22} color={T.colors.primary} />
      <Text style={styles.actionLabel}>{text}</Text>
    </TouchableOpacity>
  );
}

const Enhanced = enhance(AssetDetailInner as any);

export default function AssetDetailScreen() {
  const route = useRoute<any>();
  const assetId: string | undefined = route.params?.assetId;
  const navigation = useNavigation();

  if (!assetId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ошибка" onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title="Единица учёта не найдена" />
      </View>
    );
  }
  return <Enhanced assetId={assetId} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  content: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl },
  sectionTitle: {
    ...T.font.overline,
    color: T.colors.textSecondary,
    marginTop: T.spacing.sm,
    marginBottom: T.spacing.md,
  },
  actions: { flexDirection: 'row', gap: T.spacing.sm, marginBottom: T.spacing.xl },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: T.spacing.xs,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  actionLabel: { ...T.font.caption, color: T.colors.textSecondary, textAlign: 'center' },

  histTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  histType: { ...T.font.bodyStrong, color: T.colors.textPrimary },
  histDate: { ...T.font.caption, color: T.colors.textMuted },
  histWho: { ...T.font.small, color: T.colors.textSecondary, marginTop: T.spacing.xs },
  histHours: { ...T.font.small, color: T.colors.primary, marginTop: T.spacing.xs, fontWeight: '700' },
  histComment: { ...T.font.small, color: T.colors.textMuted, marginTop: T.spacing.xs, lineHeight: 18 },

  overlay: { flex: 1, backgroundColor: T.colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.colors.canvas,
    borderTopLeftRadius: T.radius.xxl,
    borderTopRightRadius: T.radius.xxl,
    paddingTop: T.spacing.xl,
    maxHeight: '88%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: T.spacing.xl,
    marginBottom: T.spacing.lg,
  },
  sheetTitle: { ...T.font.h2, color: T.colors.textPrimary },
  sheetBody: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxxl },
  sheetSpacer: { height: T.spacing.md },
});
