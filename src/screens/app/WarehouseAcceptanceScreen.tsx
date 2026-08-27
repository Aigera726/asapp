import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import PurchaseOrder from '@/database/models/PurchaseOrder';
import PurchaseOrderItem from '@/database/models/PurchaseOrderItem';
import PurchaseRequestItem from '@/database/models/PurchaseRequestItem';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { generateUUID } from '@/lib/uuid';
import { T } from '@/theme';

const enhance = withObservables(['orderId'], ({ orderId }) => ({
  order: database.collections.get<PurchaseOrder>('purchase_orders').findAndObserve(orderId),
  orderItems: database.collections.get<PurchaseOrderItem>('purchase_order_items').query(Q.where('order_id', orderId)),
}));

interface Props {
  order: PurchaseOrder;
  orderItems: PurchaseOrderItem[];
}

/** Код входящего контроля уходит в базу, подпись — только для оператора. */
const QUALITY_STATUSES = [
  { value: 'OK', label: 'Норма' },
  { value: 'DAMAGED', label: 'Брак' },
  { value: 'SHORTAGE', label: 'Недостача' },
] as const;

type ItemResult = { qty: number; status: string; comment: string };

const WarehouseAcceptanceScreen = ({ order, orderItems }: Props) => {
  const navigation = useNavigation();
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const [receiptComment, setReceiptComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  /** Значения по умолчанию: принято = заказано, качество ОК. */
  const defaultResult = (item: PurchaseOrderItem): ItemResult => ({
    qty: item.quantity ?? 0,
    status: 'OK',
    comment: '',
  });

  const resultFor = (item: PurchaseOrderItem): ItemResult =>
    results[item.id] ?? defaultResult(item);

  const updateResult = (item: PurchaseOrderItem, field: keyof ItemResult, val: any) => {
    setResults(prev => ({
      ...prev,
      // База — фактические значения позиции, а не нули. Раньше первое нажатие
      // на «состояние» создавало запись с qty: 0, и приёмка уходила в базу
      // с нулевым принятым количеством, хотя оператор количество не менял.
      [item.id]: { ...(prev[item.id] ?? defaultResult(item)), [field]: val },
    }));
  };

  const handleSubmit = async () => {
    if (isSaving) return;

    if (orderItems.length === 0) {
      Alert.alert('Ошибка', 'В заказе нет позиций для приёмки');
      return;
    }

    setIsSaving(true);
    try {
      await database.write(async () => {
        const receipt = await database.collections.get('warehouse_receipts').create((r: any) => {
          r._raw.id = generateUUID();
          r.orderId = order.id;
          r.receivedAt = new Date();
          r.comment = receiptComment;
        });

        for (const item of orderItems) {
          const res = resultFor(item);
          await database.collections.get('warehouse_receipt_items').create((ri: any) => {
            ri._raw.id = generateUUID();
            ri.receiptId = receipt.id;
            ri.requestItemId = item.requestItemId;
            ri.receivedQuantity = res.qty;
            ri.qualityStatus = res.status;
          });

          // Позиция заказа не всегда связана со строкой заявки (заказ мог быть
          // создан вручную). find() на пустом id ронял всю транзакцию —
          // приёмка не сохранялась целиком из-за одной несвязанной позиции.
          if (!item.requestItemId) continue;
          try {
            const reqItem = await database.collections
              .get<PurchaseRequestItem>('purchase_request_items')
              .find(item.requestItemId);
            await reqItem.update(ri => {
              ri.receivedQuantity = (ri.receivedQuantity || 0) + res.qty;
            });
          } catch (e) {
            console.warn(
              `[Acceptance] Строка заявки ${item.requestItemId} не найдена локально, пропускаем`,
              e
            );
          }
        }

        await order.update(o => {
          // Полная приёмка, только если по каждой позиции принято не меньше
          // заказанного. Раньше статус всегда был PARTIALLY_RECEIVED, и заказ
          // навсегда оставался в списке ожидающих приёмки.
          const fullyReceived = orderItems.every(
            item => resultFor(item).qty >= (item.quantity ?? 0)
          );
          o.status = fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
        });
      });
      Alert.alert('Успех', 'Приемка завершена');
      navigation.goBack();
    } catch (err: any) {
      console.error('[Acceptance] Ошибка сохранения:', err);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить приемку');
    } finally {
      setIsSaving(false);
    }
  };

  const renderItem = ({ item }: { item: PurchaseOrderItem }) => {
    const res = resultFor(item);

    return (
      <View style={styles.itemCard}>
        <Text style={styles.itemTitle}>Позиция #{item.id.slice(0, 8)}</Text>
        <Text style={styles.itemSub}>Заказано: {item.quantity ?? 0}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Принято:</Text>
          <TextInput
            style={styles.qtyInput}
            keyboardType="decimal-pad"
            defaultValue={String(item.quantity ?? 0)}
            onChangeText={(val) => updateResult(item, 'qty', parseFloat(val) || 0)}
          />
        </View>

        <Text style={styles.label}>Состояние (Входящий контроль):</Text>
        <View style={styles.statusRow}>
          {QUALITY_STATUSES.map(s => (
            <TouchableOpacity
              key={s.value}
              style={[styles.statusBtn, res.status === s.value && styles.statusBtnActive]}
              onPress={() => updateResult(item, 'status', s.value)}
            >
              <Text style={[styles.statusBtnText, res.status === s.value && styles.statusBtnTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Отмена</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Приемка ТМЦ</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={isSaving}>
          <Text style={[styles.submitText, isSaving && styles.submitTextDisabled]}>
            {isSaving ? 'Сохранение…' : 'Сохранить'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ListHeaderComponent={
          <View style={styles.orderHeader}>
            <Text style={styles.orderLabel}>Накладная: {order.invoiceNumber || 'Б/Н'}</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Общий комментарий к приемке..."
              placeholderTextColor={T.colors.textSecondary}
              value={receiptComment}
              onChangeText={setReceiptComment}
            />
          </View>
        }
        data={orderItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  backText: { color: T.colors.textSecondary, fontSize: 16 },
  submitText: { color: T.colors.success, fontSize: 16, fontWeight: '700' },
  submitTextDisabled: { color: T.colors.textDisabled },
  title: { fontSize: 20, fontWeight: '900', color: T.colors.textPrimary },
  orderHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: T.colors.surface },
  orderLabel: { color: T.colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  commentInput: { backgroundColor: T.colors.surface, borderRadius: 12, padding: 12, color: T.colors.textPrimary },
  list: { paddingBottom: 40 },
  itemCard: { backgroundColor: T.colors.surface, margin: 20, marginTop: 0, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.colors.border },
  itemTitle: { color: T.colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  itemSub: { color: T.colors.textSecondary, fontSize: 12, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  label: { color: T.colors.textSecondary, fontSize: 12, marginBottom: 8 },
  qtyInput: { flex: 1, backgroundColor: T.colors.canvas, borderRadius: 8, padding: 10, color: T.colors.textPrimary, marginLeft: 12, textAlign: 'right' },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: { flex: 1, backgroundColor: T.colors.canvas, padding: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: T.colors.border },
  statusBtnActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  statusBtnText: { color: T.colors.textDisabled, fontSize: 11, fontWeight: '700' },
  statusBtnTextActive: { color: T.colors.textOnBrand },
});

export default enhance(WarehouseAcceptanceScreen as any);
