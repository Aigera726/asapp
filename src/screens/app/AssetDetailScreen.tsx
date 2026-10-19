import { useTranslation } from '@/i18n';
import { uiLabel } from "@/i18n/ui-labels";

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
  const { language, t } = useTranslation();
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
      Alert.alert(t("common.error"), t("ui.enter_shift_operating_hours"));
      return;
    }
    if (type === 'ISSUE' && !toHolder.trim()) {
      Alert.alert(t("common.error"), t("ui.specify_the_recipient"));
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
      Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_save_the_movement"));
    } finally {
      setSaving(false);
    }
  };

  const isMachinery = asset.kind === 'MACHINERY';

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={asset.name}
        subtitle={label(ASSET_KIND_LABELS, asset.kind, language)}
        onBack={() => navigation.goBack()}
        right={
          <Badge tone={toneOf(ASSET_STATUS_TONES, asset.status)}>
            {label(ASSET_STATUS_LABELS, asset.status, language)}
          </Badge>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <InfoRow label={t("ui.model")} value={asset.model || '—'} />
          <InfoRow label={t("ui.inventory_no")} value={asset.inventoryNumber || '—'} />
          <InfoRow label={t("ui.serial_no")} value={asset.serialNumber || '—'} />
          <InfoRow label={t("ui.responsible_person")} value={asset.holderName || t("ui.not_issued")} />
          {isMachinery ? (
            <InfoRow
              label={t("ui.operating_hours")}
              value={t("ui.value_engine_h", { p0: (asset.totalHours ?? totalHours).toFixed(1) })}
            />
          ) : null}
        </Card>

        <Text style={styles.sectionTitle}>{t("ui.actions")}</Text>
        <View style={styles.actions}>
          <ActionButton icon="account-arrow-right-outline" label={t("ui.issue")} onPress={() => openSheet('ISSUE')} />
          <ActionButton icon="account-arrow-left-outline" label={t("ui.receive")} onPress={() => openSheet('RETURN')} />
          <ActionButton icon="wrench-outline" label={t("ui.send_for_repair")} onPress={() => openSheet('SERVICE')} />
          {isMachinery ? (
            <ActionButton icon="clock-outline" label={t("ui.shift")} onPress={() => openSheet('SHIFT')} />
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>{t("ui.history")}</Text>
        {history.length === 0 ? (
          <EmptyState icon="history" title={t("ui.no_movements_yet")} />
        ) : (
          history.map((m) => (
            <Card key={m.id}>
              <View style={styles.histTop}>
                <Text style={styles.histType}>{label(ASSET_MOVEMENT_LABELS, m.type, language)}</Text>
                <Text style={styles.histDate}>{formatSmartDate(m.occurredAt, language)}</Text>
              </View>
              {m.toHolder || m.fromHolder ? (
                <Text style={styles.histWho}>
                  {m.fromHolder || '—'} → {m.toHolder || t("ui.warehouse")}
                </Text>
              ) : null}
              {m.hours ? <Text style={styles.histHours}>{t("ui.operating_hours_9af89")}{' '}{m.hours}{t("ui.engine_h")}</Text> : null}
              {m.comment ? <Text style={styles.histComment}>{m.comment}</Text> : null}
            </Card>
          ))
        )}
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("ui.new_movement")}</Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Icon name="close" size={22} color={T.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Field label={t("ui.type")} required>
                <Choice options={(MOVEMENT_OPTIONS).map(option => ({ ...option, label: uiLabel(option.label, language) }))} value={type} onChange={setType} />
              </Field>

              {type !== 'RETURN' && type !== 'DECOMMISSION' ? (
                <Field label={type === 'TRANSFER' ? t("ui.destination_recipient") : t("ui.recipient")} required={type === 'ISSUE'}>
                  <TextField value={toHolder} onChangeText={setToHolder} placeholder={t("ui.full_name_or_work_area")} />
                </Field>
              ) : null}

              {type === 'SHIFT' ? (
                <Field label={t("ui.shift_operating_time_engine_h")} required>
                  <TextField value={hours} onChangeText={setHours} placeholder="8" keyboardType="decimal-pad" />
                </Field>
              ) : null}

              <Field label={t("report.comment")}>
                <TextField value={comment} onChangeText={setComment} placeholder={t("ui.reference_condition")} multiline />
              </Field>

              <PrimaryButton label={t("common.save")} onPress={handleSaveMovement} loading={saving} />
              <View style={styles.sheetSpacer} />
              <SecondaryButton label={t("common.cancel")} onPress={() => setSheetOpen(false)} />
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
  const { t } = useTranslation();
  const route = useRoute<any>();
  const assetId: string | undefined = route.params?.assetId;
  const navigation = useNavigation();

  if (!assetId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t("common.error")} onBack={() => navigation.goBack()} />
        <EmptyState icon="alert-circle-outline" title={t("ui.asset_not_found")} />
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
