import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import MaterialMovement from '@/database/models/MaterialMovement';
import { T } from '@/theme';
import { ScreenHeader, Card, Badge, EmptyState, Fab } from '@/components/ui';
import {
  MATERIAL_MOVEMENT_LABELS,
  MATERIAL_MOVEMENT_SIGN,
  MATERIAL_MOVEMENT_TONES,
  label,
  toneOf,
  formatQty,
  materialBalanceKey,
} from '@/lib/domain';
import { formatSmartDate } from '@/lib/formatDate';

const enhance = withObservables([], () => ({
  movements: database.collections.get<MaterialMovement>('material_movements').query(),
}));

/** Журнал движений по одной номенклатуре — расшифровка остатка. */
function MaterialHistoryScreen({ movements }: { movements: MaterialMovement[] }) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const balanceKey: string = route.params?.balanceKey;
  const name: string = route.params?.name ?? 'Материал';
  const unit: string | undefined = route.params?.unit;

  // Ключ строится так же, как в ResourcesScreen — по названию номенклатуры.
  const rows = useMemo(
    () =>
      movements
        .filter((m) => materialBalanceKey(m.materialName) === balanceKey)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
    [movements, balanceKey]
  );

  const balance = rows.reduce(
    (sum, m) => sum + (MATERIAL_MOVEMENT_SIGN[m.type] ?? 1) * (m.quantity || 0),
    0
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={name} subtitle="Журнал движений" onBack={() => navigation.goBack()} />

      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Card style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Остаток</Text>
            <Text style={[styles.balanceValue, balance < 0 && { color: T.colors.danger }]}>
              {formatQty(balance)} {unit || 'ед.'}
            </Text>
            {balance < 0 ? (
              <Text style={styles.balanceWarn}>
                Отрицательный остаток: расход оформлен без прихода
              </Text>
            ) : null}
          </Card>
        }
        renderItem={({ item }) => {
          const sign = MATERIAL_MOVEMENT_SIGN[item.type] ?? 1;
          return (
            <Card>
              <View style={styles.rowTop}>
                <Badge tone={toneOf(MATERIAL_MOVEMENT_TONES, item.type)}>
                  {label(MATERIAL_MOVEMENT_LABELS, item.type)}
                </Badge>
                <Text
                  style={[
                    styles.delta,
                    { color: sign > 0 ? T.colors.success : T.colors.danger },
                  ]}
                >
                  {sign > 0 ? '+' : '−'}
                  {formatQty(item.quantity)} {item.unit || unit || 'ед.'}
                </Text>
              </View>
              {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
              <View style={styles.rowFooter}>
                <Text style={styles.meta}>{formatSmartDate(item.occurredAt)}</Text>
                {item.recordSyncStatus !== 'synced' ? (
                  <Text style={styles.pending}>Ожидает отправки</Text>
                ) : null}
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon="history" title="Движений нет" />
        }
      />
      <Fab
        label="Движение"
        onPress={() =>
          navigation.navigate('MaterialForm', {
            name,
            unit,
            // Привязку к смете берём из уже существующих движений: заводить
            // новое движение по той же позиции без resource_id значило бы
            // терять связь, которую списание по нормам уже установило.
            resourceId: rows.find((m) => m.resourceId)?.resourceId,
          })
        }
      />
    </View>
  );
}

export default enhance(MaterialHistoryScreen);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  list: { paddingHorizontal: T.spacing.xl, paddingBottom: 96, flexGrow: 1 },
  balanceCard: { alignItems: 'center', backgroundColor: T.colors.surfaceSunken },
  balanceLabel: { ...T.font.overline, color: T.colors.textSecondary },
  balanceValue: { ...T.font.metric, fontSize: 30, color: T.colors.primary, marginTop: T.spacing.xs },
  balanceWarn: { ...T.font.caption, color: T.colors.danger, marginTop: T.spacing.sm, textAlign: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: T.spacing.md },
  delta: { ...T.font.bodyStrong },
  comment: { ...T.font.small, color: T.colors.textSecondary, marginTop: T.spacing.md, lineHeight: 18 },
  rowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: T.spacing.md,
  },
  meta: { ...T.font.caption, color: T.colors.textMuted },
  pending: { ...T.font.caption, color: T.colors.warning },
});
