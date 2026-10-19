import { useTranslation } from '@/i18n';
import { uiLabel } from "@/i18n/ui-labels";

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import Project from '@/database/models/Project';
import ConstructionObject from '@/database/models/ConstructionObject';
import EstimateResource from '@/database/models/EstimateResource';
import EstimateWork from '@/database/models/EstimateWork';
import { materialMovementKey } from '@/lib/materialContext';
import { removeRetiredWriteOffs, RETIRED_WRITE_OFF_IDS } from '@/lib/legacyWriteOffCleanup';
import Asset from '@/database/models/Asset';
import MaterialMovement from '@/database/models/MaterialMovement';
import { T } from '@/theme';
import {
  ScreenHeader,
  Segmented,
  ListRow,
  Badge,
  EmptyState,
  Fab,
  StatTile,
} from '@/components/ui';
import {
  ASSET_KINDS,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  MATERIAL_MOVEMENT_SIGN,
  label,
  toneOf,
  formatQty,
} from '@/lib/domain';
import { formatSmartDate } from '@/lib/formatDate';
import { useResourceDisplay } from '@/hooks/useResourceDisplay';
import { displayQty } from '@/i18n/work';

const enhance = withObservables([], () => ({
  projects: database.get<Project>('projects').query(),
  objects: database.get<ConstructionObject>('construction_objects').query(),
  resources: database.get<EstimateResource>('estimate_resources').query(),
  works: database.get<EstimateWork>('estimate_works').query(),
  assets: database.collections.get<Asset>('assets').query(),
  movements: database.collections.get<MaterialMovement>('material_movements').query(),
}));

type Tab = 'MATERIALS' | 'MACHINERY' | 'EQUIPMENT' | 'TOOL';

interface Props {
  projects: Project[];
  objects: ConstructionObject[];
  resources: EstimateResource[];
  works: EstimateWork[];
  assets: Asset[];
  movements: MaterialMovement[];
}

/** Остаток материала, посчитанный по журналу движений. */
type Balance = {
  key: string;
  projectId: string;
  resourceId: string | null;
  workId: string | null;
  workName: string;
  name: string;
  unit: string | null;
  quantity: number;
  lastAt: Date;
  movements: number;
};

function ResourcesScreen({ assets, movements, projects, objects, resources, works }: Props) {
  const { language, t } = useTranslation();
  const display = useResourceDisplay();
  const navigation = useNavigation<any>();
  useEffect(() => { removeRetiredWriteOffs().catch((e) => console.error('[Cleanup]', e)); }, []);
  const contextFor = (projectId: string | null) => {
    const object = projects.find((p) => p.id === projectId);
    const project = objects.find((o) => o.id === object?.objectId);
    return t("ui.project_3bab6") + (project?.name ?? t("ui.not_specified_47846")) + t("ui.site") + (object?.name ?? t("ui.not_specified_47846"));
  };
  const [tab, setTab] = useState<Tab>('MATERIALS');

  /**
   * Остатки — агрегация журнала, а не отдельная изменяемая строка.
   * Группируем по названию (materialBalanceKey): позиции, заведённые вручную,
   * и списания по нормам должны сводиться в одну строку остатка.
   */
  const balances = useMemo<Balance[]>(() => {
    const acc = new Map<string, Balance>();
    for (const m of movements) {
      if (RETIRED_WRITE_OFF_IDS.has(m.id)) continue;
      const key = materialMovementKey(m);
      const sign = MATERIAL_MOVEMENT_SIGN[m.type] ?? 1;
      const prev = acc.get(key);
      if (prev) {
        prev.quantity += sign * (m.quantity || 0);
        prev.movements += 1;
        if (m.occurredAt > prev.lastAt) prev.lastAt = m.occurredAt;
      } else {
        acc.set(key, {
          key,
          projectId: m.projectId,
          resourceId: m.resourceId,
          workId: resources.find(r => r.id === m.resourceId)?.estimateWorkId ?? null,
          workName: works.find((w) => w.id === resources.find((r) => r.id === m.resourceId)?.estimateWorkId)?.name ?? '',
          name: m.materialName,
          unit: m.unit,
          quantity: sign * (m.quantity || 0),
          lastAt: m.occurredAt,
          movements: 1,
        });
      }
    }
    return Array.from(acc.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  }, [movements, projects, objects, resources, works]);

  const byKind = useMemo(() => {
    const map: Record<string, Asset[]> = { MACHINERY: [], EQUIPMENT: [], TOOL: [] };
    for (const a of assets) {
      if (map[a.kind]) map[a.kind].push(a);
    }
    return map;
  }, [assets]);

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'MATERIALS', label: t("home.materials"), count: balances.length },
    ...ASSET_KINDS.map((k) => ({
      value: k.value as Tab,
      label: uiLabel(k.plural, language),
      count: byKind[k.value]?.length ?? 0,
    })),
  ];

  // ── Материалы ──────────────────────────────────────────────────────────────
  if (tab === 'MATERIALS') {
    const negative = balances.filter((b) => b.quantity < 0).length;
    return (
      <View style={styles.container}>
        <ScreenHeader title={t("nav.Resources")} subtitle={t("ui.warehouse_and_equipment_fleet")} large />
        <Segmented items={tabs} value={tab} onChange={setTab} />

        <FlatList
          data={balances}
          keyExtractor={(b) => b.key}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            balances.length > 0 ? (
              <View style={styles.statsRow}>
                <StatTile value={balances.length} label={t("ui.stock_items")} />
                <StatTile value={balances.reduce((sum, b) => sum + b.movements, 0)} label={t("ui.movements")} />
                <StatTile
                  value={negative}
                  label={t("ui.negative_balances")}
                  tone={negative > 0 ? T.colors.danger : undefined}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ListRow
              icon="package-variant-closed"
              title={display.name(item.resourceId, item.name)}
              subtitle={contextFor(item.projectId)}
              subtitleLines={4}
              meta={t("ui.work_value_value_movements_value", { p0: display.work(item.workId, item.workName) || t('ui.not_linked'), p1: displayQty(item.movements, language), p2: formatSmartDate(item.lastAt, language) })}
              badge={
                <View style={styles.qtyBox}>
                  <Text
                    style={[
                      styles.qtyValue,
                      item.quantity < 0 && { color: T.colors.danger },
                    ]}
                  >
                    {displayQty(item.quantity, language)}
                  </Text>
                  <Text style={styles.qtyUnit}>{display.unit(item.resourceId, item.unit)}</Text>
                </View>
              }
              onPress={() =>
                navigation.navigate('MaterialHistory', {
                  balanceKey: item.key,
                  projectId: item.projectId,
                  context: contextFor(item.projectId),
                  workId: item.workId,
                  workName: item.workName,
                  name: item.name,
                  unit: item.unit ?? undefined,
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="package-variant"
              title={t("ui.warehouse_is_empty")}
              text={t("ui.record_a_material_receipt_balances_are_calculated_from_movement")}
              actionLabel={t("ui.record_movement")}
              onAction={() => navigation.navigate('MaterialForm', {})}
            />
          }
        />
        {balances.length > 0 ? (
          <Fab label={t("ui.movement")} onPress={() => navigation.navigate('MaterialForm', {})} />
        ) : null}
      </View>
    );
  }

  // ── Техника / оборудование / инструменты ───────────────────────────────────
  const kindMeta = ASSET_KINDS.find((k) => k.value === tab)!;
  const list = byKind[tab] ?? [];
  const inRepair = list.filter((a) => a.status === 'REPAIR').length;
  const inUse = list.filter((a) => a.status === 'IN_USE').length;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("nav.Resources")} subtitle={t("ui.warehouse_and_equipment_fleet")} large />
      <Segmented items={tabs} value={tab} onChange={setTab} />

      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          list.length > 0 ? (
            <View style={styles.statsRow}>
              <StatTile value={list.length} label={t("ui.total")} />
              <StatTile value={inUse} label={t("work.inProgress")} tone={T.colors.success} />
              <StatTile
                value={inRepair}
                label={t("ui.under_repair")}
                tone={inRepair > 0 ? T.colors.warning : undefined}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListRow
            icon={kindMeta.icon as any}
            title={item.name}
            subtitle={[item.model, item.inventoryNumber && t("ui.inv_value", { p0: item.inventoryNumber })]
              .filter(Boolean)
              .join(' · ')}
            meta={`${contextFor(item.projectId)}\n${item.holderName ? t("ui.held_by_value", { p0: item.holderName }) : t("ui.not_issued")}`}
            badge={
              <Badge tone={toneOf(ASSET_STATUS_TONES, item.status)}>
                {label(ASSET_STATUS_LABELS, item.status, language)}
              </Badge>
            }
            onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={kindMeta.icon as any}
            title={t("ui.value_empty", { p0: uiLabel(kindMeta.plural, language) })}
            text={t("ui.register_an_asset_to_track_issues_returns_and_repairsvalue", { p0: tab === 'MACHINERY' ? t("ui.and_shift_operating_time") : '' })}
            actionLabel={t("ui.add")}
            onAction={() => navigation.navigate('AssetForm', { kind: tab })}
          />
        }
      />
      {list.length > 0 ? (
        <Fab label={t("ui.add")} onPress={() => navigation.navigate('AssetForm', { kind: tab })} />
      ) : null}
    </View>
  );
}

export default enhance(ResourcesScreen);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  list: { paddingHorizontal: T.spacing.xl, paddingBottom: 96, flexGrow: 1 },
  statsRow: { flexDirection: 'row', gap: T.spacing.sm, marginBottom: T.spacing.lg },
  qtyBox: { alignItems: 'flex-end', minWidth: 64 },
  qtyValue: { fontSize: 18, fontWeight: '500', letterSpacing: -0.5, color: T.colors.primary },
  qtyUnit: { fontSize: 11, color: T.colors.textMuted, marginTop: 2 },
});
