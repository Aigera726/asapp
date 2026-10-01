import { ScreenHeader } from '@/components/ui';
import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import { syncDatabase } from '@/database/sync';
import PurchaseRequest from '@/database/models/PurchaseRequest';
import PurchaseOrder from '@/database/models/PurchaseOrder';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStatusLabel, getStatusColor, formatAmount } from '@/lib/statusLabels';
import { formatSmartDate } from '@/lib/formatDate';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';

const enhance = withObservables([], () => ({
  requests: database.collections.get<PurchaseRequest>('purchase_requests').query(),
  orders: database.collections.get<PurchaseOrder>('purchase_orders').query(),
}));

interface Props {
  requests: PurchaseRequest[];
  orders: PurchaseOrder[];
}

const ProcurementListScreen = ({ requests, orders }: Props) => {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<'requests' | 'orders'>('requests');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncDatabase(false);
    } catch (err: any) {
      Alert.alert('Ошибка синхронизации', err.message ?? 'Попробуйте ещё раз');
    } finally {
      setRefreshing(false);
    }
  };

  const renderRequest = ({ item }: { item: PurchaseRequest }) => {
    const sc = getStatusColor(item.status);
    const isSynced = (item as any)._raw._status === 'synced';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('RequestDetail', { requestId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>
              {item.requestNumber ? `Заявка #${item.requestNumber}` : 'Новая заявка'}
            </Text>
            {!isSynced && <View style={styles.unsyncedDot} />}
          </View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.text }]}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>
        {item.comment ? (
          <Text style={styles.cardComment} numberOfLines={2}>{item.comment}</Text>
        ) : null}
        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>{formatSmartDate(item.updatedAt)}</Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderOrder = ({ item }: { item: PurchaseOrder }) => {
    // Цвет берём по статусу, а не фиксированный зелёный: раньше отменённый
    // заказ выглядел так же, как успешно доставленный.
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
        {/* totalAmount приходит из БД и бывает null — прямой toLocaleString() ронял экран */}
        <Text style={styles.cardComment}>Сумма: {formatAmount(item.totalAmount)}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>Нажмите для приемки</Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const currentData = activeTab === 'requests' ? requests : orders;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Закупки" subtitle="Заявки и заказы" onBack={() => navigation.goBack()} right={
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('CreateRequest', { projectId: '' })}>
          <Text style={styles.addBtnText}>+ Создать</Text>
        </TouchableOpacity>
      } />

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
            Потребности
          </Text>
          {requests.length > 0 && (
            <View style={[styles.tabBadge, activeTab === 'requests' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'requests' && styles.tabBadgeTextActive]}>{requests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'orders' && styles.activeTab]}
          onPress={() => setActiveTab('orders')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'orders' && styles.activeTabText]}>Заказы</Text>
          {orders.length > 0 && (
            <View style={[styles.tabBadge, activeTab === 'orders' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'orders' && styles.tabBadgeTextActive]}>{orders.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={currentData as any[]}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === 'requests' ? (renderRequest as any) : (renderOrder as any)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name={activeTab === 'requests' ? 'clipboard-list-outline' : 'package-variant-closed'} size={34} color={T.colors.textDisabled} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'requests' ? 'Нет заявок' : 'Нет заказов'}
            </Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'requests'
                ? 'Создайте первую заявку на закупку\nнажав кнопку «+ Создать» выше'
                : 'Заказы появятся после согласования заявок'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center', flex: 1, backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { padding: 4 },
  backText: { color: T.colors.textSecondary, fontSize: 16 },
  title: { fontSize: 22, fontWeight: '900', color: T.colors.textPrimary },
  addBtn: { backgroundColor: T.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: T.colors.textOnBrand, fontWeight: '700', fontSize: 14 },
  tabContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, backgroundColor: T.colors.surface, borderRadius: 12, padding: 3 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  activeTab: { backgroundColor: T.colors.primary },
  tabText: { color: T.colors.textMuted, fontWeight: '600', fontSize: 14 },
  activeTabText: { color: T.colors.textOnBrand },
  tabBadge: { backgroundColor: T.colors.primarySoftStrong, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, minWidth: 22, alignItems: 'center' },
  tabBadgeActive: { backgroundColor: T.colors.primary },
  tabBadgeText: { color: T.colors.textMuted, fontSize: 11, fontWeight: '700' },
  tabBadgeTextActive: { color: T.colors.textOnBrand },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  card: { backgroundColor: T.colors.surface, padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: T.colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  cardTitle: { color: T.colors.textPrimary, fontSize: 15, fontWeight: '700' },
  unsyncedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.colors.warning },
  cardComment: { color: T.colors.textSecondary, fontSize: 13, marginBottom: 8, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { color: T.colors.textDisabled, fontSize: 12 },
  cardArrow: { color: T.colors.textDisabled, fontSize: 20 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: T.colors.textMuted, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptySubtext: { color: T.colors.textDisabled, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

export default enhance(ProcurementListScreen);
