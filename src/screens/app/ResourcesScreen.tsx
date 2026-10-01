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
  context: string;
  workName: string;
  name: string;
  unit: string | null;
  quantity: number;
  lastAt: Date;
  movements: number;
};

function ResourcesScreen({ assets, movements, projects, objects, resources, works }: Props) {
  const navigation = useNavigation<any>();
  useEffect(() => { removeRetiredWriteOffs().catch((e) => console.error('[Cleanup]', e)); }, []);
  const contextFor = (projectId: string | null) => {
    const object = projects.find((p) => p.id === projectId);
    const project = objects.find((o) => o.id === object?.objectId);
    return 'Проект: ' + (project?.name ?? 'не указан') + '\nОбъект: ' + (object?.name ?? 'не указан');
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
          context: contextFor(m.projectId),
          workName: works.find((w) => w.id === resources.find((r) => r.id === m.resourceId)?.estimateWorkId)?.name ?? 'не привязана',
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
    { value: 'MATERIALS', label: 'Материалы', count: balances.length },
    ...ASSET_KINDS.map((k) => ({
      value: k.value as Tab,
      label: k.plural,
      count: byKind[k.value]?.length ?? 0,
    })),
  ];

  // ── Материалы ──────────────────────────────────────────────────────────────
  if (tab === 'MATERIALS') {
    const negative = balances.filter((b) => b.quantity < 0).length;
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ресурсы" subtitle="Склад и парк оборудования" large />
        <Segmented items={tabs} value={tab} onChange={setTab} />

        <FlatList
          data={balances}
          keyExtractor={(b) => b.key}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            balances.length > 0 ? (
              <View style={styles.statsRow}>
                <StatTile value={balances.length} label="Номенклатур" />
                <StatTile value={balances.reduce((sum, b) => sum + b.movements, 0)} label="Движений" />
                <StatTile
                  value={negative}
                  label="В минусе"
                  tone={negative > 0 ? T.colors.danger : undefined}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ListRow
              icon="package-variant-closed"
              title={item.name}
              subtitle={item.context}
              subtitleLines={4}
              meta={`Работа: ${item.workName}\n${item.movements} движ. · ${formatSmartDate(item.lastAt)}`}
              badge={
                <View style={styles.qtyBox}>
                  <Text
                    style={[
                      styles.qtyValue,
                      item.quantity < 0 && { color: T.colors.danger },
                    ]}
                  >
                    {formatQty(item.quantity)}
                  </Text>
                  <Text style={styles.qtyUnit}>{item.unit || 'ед.'}</Text>
                </View>
              }
              onPress={() =>
                navigation.navigate('MaterialHistory', {
                  balanceKey: item.key,
                  projectId: item.projectId,
                  context: item.context,
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
              title="Склад пуст"
              text="Оформите приход материалов — остатки посчитаются по журналу движений автоматически."
              actionLabel="Оформить движение"
              onAction={() => navigation.navigate('MaterialForm', {})}
            />
          }
        />
        {balances.length > 0 ? (
          <Fab label="Движение" onPress={() => navigation.navigate('MaterialForm', {})} />
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
      <ScreenHeader title="Ресурсы" subtitle="Склад и парк оборудования" large />
      <Segmented items={tabs} value={tab} onChange={setTab} />

      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          list.length > 0 ? (
            <View style={styles.statsRow}>
              <StatTile value={list.length} label="Всего" />
              <StatTile value={inUse} label="В работе" tone={T.colors.success} />
              <StatTile
                value={inRepair}
                label="В ремонте"
                tone={inRepair > 0 ? T.colors.warning : undefined}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListRow
            icon={kindMeta.icon as any}
            title={item.name}
            subtitle={[item.model, item.inventoryNumber && `инв. ${item.inventoryNumber}`]
              .filter(Boolean)
              .join(' · ')}
            meta={`${contextFor(item.projectId)}\n${item.holderName ? `У кого: ${item.holderName}` : 'Не выдано'}`}
            badge={
              <Badge tone={toneOf(ASSET_STATUS_TONES, item.status)}>
                {label(ASSET_STATUS_LABELS, item.status)}
              </Badge>
            }
            onPress={() => navigation.navigate('AssetDetail', { assetId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={kindMeta.icon as any}
            title={`${kindMeta.plural}: пусто`}
            text={`Добавьте единицу учёта, чтобы вести выдачу, возвраты, ремонты${
              tab === 'MACHINERY' ? ' и наработку смен' : ''
            }.`}
            actionLabel="Добавить"
            onAction={() => navigation.navigate('AssetForm', { kind: tab })}
          />
        }
      />
      {list.length > 0 ? (
        <Fab label="Добавить" onPress={() => navigation.navigate('AssetForm', { kind: tab })} />
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
