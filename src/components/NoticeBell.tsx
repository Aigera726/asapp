import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from './Icon';
import { useUnreadCount } from '@/store/noticeStore';
import { useTranslation } from '@/i18n';
import { ECO as E } from '@/theme/ecopro';

/** Колокольчик уведомлений в шапке: красная метка — число новых. */
export function NoticeBell() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const count = useUnreadCount();
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('notice.bell', { count: String(count) })}
      onPress={() => navigation.navigate('Notifications')} style={styles.btn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Icon name={count > 0 ? 'bell-ring-outline' : 'bell-outline'} size={22} color={count > 0 ? E.blue : E.muted} />
      {count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: E.line, backgroundColor: E.surface, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
