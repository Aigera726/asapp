import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import BpmTask from '@/database/models/BpmTask';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';

const enhance = withObservables([], () => ({
  tasks: database.collections.get<BpmTask>('bpm_tasks').query(
    Q.where('status', 'PENDING')
  ),
}));

interface Props {
  tasks: BpmTask[];
}

/** Подписи типов действий: в БД лежат коды, оператору нужен русский текст. */
const ACTION_LABELS: Record<string, string> = {
  APPROVE: 'Согласование',
  SIGN: 'Подписание',
  ACKNOWLEDGE: 'Ознакомление',
};

const ApprovalListScreen = ({ tasks }: Props) => {
  const navigation = useNavigation<any>();
  const [pendingId, setPendingId] = useState<string | null>(null);

  /**
   * Кнопки «Одобрить»/«Отклонить» раньше были без onPress — экран выглядел
   * рабочим, но ни одно решение не сохранялось. Теперь решение пишется
   * локально и уезжает на сервер обычной синхронизацией (offline-first).
   */
  const resolveTask = (task: BpmTask, decision: 'APPROVED' | 'REJECTED') => {
    const isApprove = decision === 'APPROVED';
    Alert.alert(
      isApprove ? 'Одобрить?' : 'Отклонить?',
      `${task.stepLabel || 'Задача'} — ${
        isApprove ? 'будет отправлено согласование' : 'будет отправлен отказ'
      }.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: isApprove ? 'Одобрить' : 'Отклонить',
          style: isApprove ? 'default' : 'destructive',
          onPress: async () => {
            setPendingId(task.id);
            try {
              await database.write(async () => {
                await task.update((t) => {
                  t.status = decision;
                });
              });
            } catch (err: any) {
              console.error('[Approvals] Не удалось сохранить решение:', err);
              Alert.alert('Ошибка', err?.message ?? 'Не удалось сохранить решение');
            } finally {
              setPendingId(null);
            }
          },
        },
      ]
    );
  };

  const renderTask = ({ item }: { item: BpmTask }) => {
    const isBusy = pendingId === item.id;
    return (
      <View style={styles.card}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Documents')}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.stepLabel || 'Задача согласования'}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {ACTION_LABELS[item.actionType] ?? item.actionType}
              </Text>
            </View>
          </View>
          <Text style={styles.cardSubtext}>Задание ожидает вашего решения</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn, isBusy && styles.actionBtnDisabled]}
            onPress={() => resolveTask(item, 'APPROVED')}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            <Text style={styles.actionText}>Одобрить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn, isBusy && styles.actionBtnDisabled]}
            onPress={() => resolveTask(item, 'REJECTED')}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            <Text style={styles.actionText}>Отклонить</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Согласование</Text>
        {tasks.length > 0 && (
          <Text style={styles.headerCount}>{tasks.length}</Text>
        )}
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="draw-pen" size={30} color={T.colors.textDisabled} />
            <Text style={styles.emptyText}>Нет активных задач на согласование</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default enhance(ApprovalListScreen);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: T.spacing.xl,
    paddingTop: T.spacing.lg,
    paddingBottom: T.spacing.md,
  },
  title: { ...T.font.h1, color: T.colors.textPrimary },
  headerCount: {
    ...T.font.caption,
    color: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
    paddingHorizontal: T.spacing.md,
    paddingVertical: T.spacing.xs,
    borderRadius: T.radius.pill,
    overflow: 'hidden',
  },
  list: { paddingHorizontal: T.spacing.xl, paddingBottom: T.spacing.xxl, flexGrow: 1 },
  card: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    marginBottom: T.spacing.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    ...T.shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: T.spacing.sm,
  },
  cardTitle: { ...T.font.bodyStrong, color: T.colors.textPrimary, flex: 1 },
  badge: {
    backgroundColor: T.colors.primarySoft,
    borderRadius: T.radius.sm,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 3,
  },
  badgeText: { ...T.font.caption, fontSize: 10, color: T.colors.primaryText },
  cardSubtext: {
    ...T.font.small,
    color: T.colors.textSecondary,
    marginTop: T.spacing.xs,
    marginBottom: T.spacing.md,
  },
  actions: { flexDirection: 'row', gap: T.spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionBtnDisabled: { opacity: 0.5 },
  approveBtn: {
    backgroundColor: T.colors.successSoft,
    borderColor: T.colors.successBorder,
  },
  rejectBtn: {
    backgroundColor: T.colors.dangerSoft,
    borderColor: T.colors.dangerBorder,
  },
  actionText: { ...T.font.small, fontWeight: '700', color: T.colors.textPrimary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: T.spacing.md },
  emptyText: {
    ...T.font.body,
    color: T.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: T.spacing.xl,
  },
});
