import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import './src/styles/global.css';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider } from '@/database/DatabaseProvider';
import RootNavigation from '@/navigation';
import ServerStatusBar from '@/components/ServerStatusBar';
import { BrandLockup } from '@/components/Brand';
import { useConfigStore } from '@/store/configStore';
import { T } from '@/theme';

export default function App() {
  const { isLoaded, loadConfig } = useConfigStore();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={T.colors.canvasDeep} />
        {!isLoaded ? (
          // Брендированный сплэш вместо пустого экрана: загрузка конфига
          // сервера может занять заметное время на холодном старте.
          <View style={styles.splash}>
            <BrandLockup subtitle="Управление строительством" />
            <ActivityIndicator
              color={T.colors.accent}
              style={styles.splashSpinner}
            />
          </View>
        ) : (
          <DatabaseProvider>
            <ServerStatusBar />
            <RootNavigation />
          </DatabaseProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.colors.canvas,
  },
  splashSpinner: {
    marginTop: T.spacing.xxxl,
  },
});
