import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import PurchaseRequest from '@/database/models/PurchaseRequest';
import PurchaseRequestItem from '@/database/models/PurchaseRequestItem';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStatusLabel, getStatusColor } from '@/lib/statusLabels';
import { formatSmartDate } from '@/lib/formatDate';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';

// ─── Enhanced (observable) detail component ─────────────────────────────────
interface EnhancedProps {
  requestId: string;
  request: PurchaseRequest;
  items: PurchaseRequestItem[];
}

const enhance = withObservables(['requestId'], ({ requestId }: { requestId: string }) => ({
  request: database.collections.get<PurchaseRequest>('purchase_requests').findAndObserve(requestId),
  items: database.collections.get<PurchaseRequestItem>('purchase_request_items').query(Q.where('request_id', requestId)),
}));

const RequestDetailInner = ({ request, items }: EnhancedProps) => {
  const navigation = useNavigation();

  const isSynced = (request as any)._raw._status === 'synced';
  const sc = getStatusColor(request.status);

  const handleDelete = async () => {
    Alert.alert(
      'Удалить заявку?',
      'Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                // Delete items first
                for (const item of items) {
                  await item.markAsDeleted();
                }
                await request.markAsDeleted();
              });
              navigation.goBack();
            } catch (err) {
              console.error('[RequestDetail] Delete error:', err);
              Alert.alert('Ошибка', 'Не удалось удалить заявку');
            }
          },
        },
      ]
    );
  };

  // Calculate total items requested
  const totalQty = items.reduce((sum, i) => sum + (i.requestedQuantity || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>‹ Назад</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Детали заявки</Text>
        {!isSynced && (
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="trash-can-outline" size={20} color={T.colors.danger} />
          </TouchableOpacity>
        )}
        {isSynced && <View style={{ width: 30 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status hero */}
        <View style={styles.statusHero}>
          <View style={[styles.statusHeroBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusHeroText, { color: sc.text }]}>
              {getStatusLabel(request.status)}
            </Text>
          </View>
          <Text style={styles.requestTitle}>
            {request.requestNumber ? `Заявка #${request.requestNumber}` : 'Новая заявка'}
          </Text>
          <Text style={styles.requestDate}>{formatSmartDate(request.updatedAt)}</Text>
        </View>

        {/* Info cards */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardValue}>{items.length}</Text>
            <Text style={styles.infoCardLabel}>Позиций</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardValue}>{totalQty}</Text>
            <Text style={styles.infoCardLabel}>Ед. всего</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={[styles.syncDot, { backgroundColor: isSynced ? T.colors.success : T.colors.warning }]} />
            <Text style={styles.infoCardLabel}>{isSynced ? 'Синхр.' : 'Ожидает'}</Text>
          </View>
        </View>

        {/* Comment */}
        {request.comment ? (
          <View style={styles.commentCard}>
            <Icon name="comment-text-outline" size={18} color={T.colors.textMuted} />
            <Text style={styles.commentText}>{request.comment}</Text>
          </View>
        ) : null}

        {/* Items list */}
        <Text style={styles.sectionTitle}>Позиции</Text>
        {items.map((item, index) => {
          const progress = item.requestedQuantity > 0
            ? Math.min((item.receivedQuantity || 0) / item.requestedQuantity, 1)
            : 0;

          return (
            <View style={styles.itemCard} key={item.id}>
              <View style={styles.itemIndex}>
                <Text style={styles.itemIndexText}>{index + 1}</Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.itemName || 'Неизвестный материал'}</Text>
                <Text style={styles.itemUnit}>{item.unit || 'шт'}</Text>
                {progress > 0 && (
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  </View>
                )}
              </View>
              <View style={styles.itemQtyContainer}>
                <Text style={styles.itemQty}>{item.requestedQuantity}</Text>
                {(item.receivedQuantity || 0) > 0 && (
                  <Text style={styles.itemReceived}>получено {item.receivedQuantity}</Text>
                )}
              </View>
            </View>
          );
        })}

        {items.length === 0 && (
          <View style={styles.empty}>
            <Icon name="inbox-outline" size={30} color={T.colors.textDisabled} />
            <Text style={styles.emptyText}>Нет позиций</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const EnhancedRequestDetail = enhance(RequestDetailInner as any);

// ─── Screen wrapper ─────────────────────────────────────────────────────────
const RequestDetailScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const requestId: string = route.params?.requestId;

  if (!requestId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Назад</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Ошибка</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={styles.empty}>
          <Icon name="alert-circle-outline" size={30} color={T.colors.danger} />
          <Text style={styles.emptyText}>Заявка не найдена</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <EnhancedRequestDetail requestId={requestId} />;
};

export default RequestDetailScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { padding: 4 },
  backText: { color: T.colors.textSecondary, fontSize: 16 },
  title: { fontSize: 18, fontWeight: '800', color: T.colors.textPrimary },
  deleteText: { fontSize: 18 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  // Status hero
  statusHero: { alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  statusHeroBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  statusHeroText: { fontSize: 13, fontWeight: '700' },
  requestTitle: { fontSize: 22, fontWeight: '900', color: T.colors.textPrimary, marginBottom: 4 },
  requestDate: { color: T.colors.textMuted, fontSize: 13 },
  // Info grid
  infoGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  infoCard: { flex: 1, backgroundColor: T.colors.surface, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: T.colors.border },
  infoCardValue: { fontSize: 24, fontWeight: '800', color: T.colors.textPrimary, marginBottom: 4 },
  infoCardLabel: { fontSize: 11, color: T.colors.textMuted, fontWeight: '600' },
  syncDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 8 },
  // Comment
  commentCard: { backgroundColor: T.colors.surface, borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: T.colors.border, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  commentIcon: { fontSize: 16 },
  commentText: { color: T.colors.textSecondary, fontSize: 14, lineHeight: 20, flex: 1 },
  // Section
  sectionTitle: { color: T.colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 },
  // Items
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.colors.surface, padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: T.colors.border },
  itemIndex: { width: 28, height: 28, borderRadius: 8, backgroundColor: T.colors.canvas, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  itemIndexText: { color: T.colors.textMuted, fontSize: 12, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { color: T.colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  itemUnit: { color: T.colors.textDisabled, fontSize: 12 },
  progressBar: { height: 3, backgroundColor: T.colors.border, borderRadius: 2, marginTop: 6 },
  progressFill: { height: 3, backgroundColor: T.colors.success, borderRadius: 2 },
  itemQtyContainer: { alignItems: 'flex-end', marginLeft: 12 },
  itemQty: { color: T.colors.primary, fontSize: 18, fontWeight: '800' },
  itemReceived: { color: T.colors.success, fontSize: 10, fontWeight: '600', marginTop: 2 },
  // Empty
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { color: T.colors.textDisabled, fontSize: 15 },
});
