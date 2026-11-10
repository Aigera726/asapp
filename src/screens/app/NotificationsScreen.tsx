import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader, Card, EmptyState } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { useNoticeStore } from '@/store/noticeStore';
import { useTranslation } from '@/i18n';
import { noticeTitle, noticeBody } from '@/i18n/notices';
import { displayDate } from '@/i18n/work';
import type { Notice } from '@/lib/notices';
import { T } from '@/theme';
import { ECO as E } from '@/theme/ecopro';

const look = (n: Notice): { icon: IconName; color: string } => {
  if (n.kind === 'report') return n.status === 'approved' ? { icon: 'check-circle-outline', color: '#059669' } : { icon: 'close-circle-outline', color: '#DC2626' };
  if (n.status === 'PENDING_APPROVAL') return { icon: 'clock-outline', color: '#D97706' };
  return n.status === 'APPROVED' ? { icon: 'file-check-outline', color: '#059669' } : { icon: 'file-cancel-outline', color: '#DC2626' };
};

/** Уведомления за 30 дней: ДС к договорам и решения ERP по отправленным объёмам. Открытие экрана — всё прочитано. */
export default function NotificationsScreen() {
  const { t, language } = useTranslation();
  const navigation = useNavigation();
  const notices = useNoticeStore(s => s.notices), seen = useNoticeStore(s => s.seen), markAllSeen = useNoticeStore(s => s.markAllSeen);
  // «Новое» подсвечивается у того, что было непрочитанным при открытии экрана.
  const [fresh] = useState(() => new Set(notices.filter(n => !seen.has(n.id)).map(n => n.id)));
  useEffect(() => { markAllSeen(); }, [notices.length, markAllSeen]);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('notice.title')} subtitle={t('notice.subtitle')} onBack={() => navigation.goBack()} />
      <FlatList
        data={notices}
        keyExtractor={n => n.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState icon="bell-outline" title={t('notice.empty')} text={t('notice.emptyText')} />}
        renderItem={({ item }) => {
          const { icon, color } = look(item);
          const who = item.kind === 'report' ? item.decidedBy : null;
          return (
            <Card style={fresh.has(item.id) ? styles.fresh : undefined}>
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: color + '1A' }]}><Icon name={icon} size={20} color={color} /></View>
                <View style={styles.body}>
                  <Text style={styles.title}>{noticeTitle(item, language)}</Text>
                  <Text style={styles.text}>{noticeBody(item, language)}</Text>
                  <Text style={styles.meta}>{[displayDate(new Date(item.at), language), who].filter(Boolean).join(' · ')}
                    {fresh.has(item.id) ? <Text style={styles.newMark}>  {t('notice.new')}</Text> : null}</Text>
                </View>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  list: { padding: 20, gap: 12, paddingBottom: 40, flexGrow: 1 },
  fresh: { borderColor: E.blue },
  row: { flexDirection: 'row', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: T.colors.textPrimary },
  text: { marginTop: 4, fontSize: 14, color: T.colors.textPrimary, lineHeight: 20 },
  meta: { marginTop: 8, fontSize: 12, color: E.muted },
  newMark: { color: E.blue, fontWeight: '700' },
});
