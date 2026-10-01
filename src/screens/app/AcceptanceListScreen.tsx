import { ScreenHeader } from '@/components/ui';
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import PurchaseOrder from '@/database/models/PurchaseOrder';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { getStatusLabel, getStatusColor, OPEN_ORDER_STATUSES } from '@/lib/statusLabels';
import { T } from '@/theme';

const enhance = withObservables([], () => ({
  // Статуса DELIVERED в данных не бывает — заказы завершаются как RECEIVED,
  // поэтому старый фильтр notEq('DELIVERED') показывал в приёмке всё,
  // включая уже принятые и отменённые заказы.
  orders: database.collections.get<PurchaseOrder>('purchase_orders').query(
    Q.where('status', Q.oneOf(OPEN_ORDER_STATUSES))
  ),
}));

interface Props {
  orders: PurchaseOrder[];
}

const AcceptanceListScreen = ({ orders }: Props) => {
  const navigation = useNavigation<any>();

  const renderOrder = ({ item }: { item: PurchaseOrder }) => {
    const sc = getStatusColor(item.status);
    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => navigation.navigate('WarehouseAcceptance', { orderId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Заказ #{item.invoiceNumber || item.id.slice(0, 8)}</Text>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.text }]}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>
      <Text style={styles.cardSubtext}>Ожидается приемка материалов</Text>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Нажмите для начала входящего контроля</Text>
        <Text style={styles.arrow}>›</Text>
      </View>
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Приёмка грузов" subtitle="Входящий контроль поставок" onBack={() => navigation.goBack()} />

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Активных заказов для приемки нет</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center', flex: 1, backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  backText: { color: T.colors.textSecondary, fontSize: 16 },
  title: { fontSize: 20, fontWeight: '900', color: T.colors.textPrimary },
  list: { padding: 20 },
  card: { backgroundColor: T.colors.surface, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: T.colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: T.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  badge: { backgroundColor: T.colors.neutralSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: T.colors.textSecondary, fontSize: 10, fontWeight: '800' },
  cardSubtext: { color: T.colors.textPrimary, fontSize: 14, fontWeight: '500', marginBottom: 16 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: T.colors.border, paddingTop: 12 },
  footerText: { color: T.colors.primary, fontSize: 12, fontWeight: '600' },
  arrow: { color: T.colors.primary, fontSize: 18 },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: T.colors.textDisabled, fontSize: 16 },
});

export default enhance(AcceptanceListScreen);
