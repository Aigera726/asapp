import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useConfigStore } from '@/store/configStore';
import { useAuthStore } from '@/store/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/theme';

/**
 * Верхняя полоса статуса: к какому серверу подключены и есть ли сеть.
 * Это самый верхний элемент приложения, поэтому именно он «съедает»
 * системный отступ сверху — экраны ниже добавляют только свои отступы.
 */
export default function ServerStatusBar() {
  const { serverName } = useConfigStore();
  const { session } = useAuthStore();
  const [isConnected, setIsConnected] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // Default online connection needs no permanent banner. Keep custom-server
  // identification and offline warnings visible.
  if (!session || (isConnected && (!serverName || serverName === 'По умолчанию'))) {
    return null;
  }

  return (
    // Отступ нужен на обеих платформах: на Android включён edge-to-edge,
    // и без него плашка уезжает под системную строку состояния.
    <View style={[styles.container, { paddingTop: insets.top + 4 }]}>
      <View style={[styles.badge, isConnected ? styles.badgeOnline : styles.badgeOffline]}>
        <View style={[styles.dot, isConnected ? styles.dotOnline : styles.dotOffline]} />
        <Text style={[styles.text, !isConnected && styles.textOffline]}>
          {serverName || 'По умолчанию'}
          {isConnected ? '' : ' · нет сети'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: T.colors.canvasDeep,
    alignItems: 'center',
    paddingBottom: T.spacing.xs,
    zIndex: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: T.spacing.md,
    paddingVertical: T.spacing.xs,
    borderRadius: T.radius.pill,
    borderWidth: 1,
  },
  badgeOnline: {
    backgroundColor: T.colors.successSoft,
    borderColor: T.colors.successBorder,
  },
  badgeOffline: {
    backgroundColor: T.colors.dangerSoft,
    borderColor: T.colors.dangerBorder,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: T.spacing.sm,
  },
  dotOnline: {
    backgroundColor: T.colors.success,
  },
  dotOffline: {
    backgroundColor: T.colors.danger,
  },
  text: {
    color: T.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  textOffline: {
    color: T.colors.danger,
  },
});
