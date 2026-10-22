import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import './src/styles/global.css';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, LogBox, StyleSheet } from 'react-native';
import { HANDLED_SESSION_LOGS } from '@/lib/auth-connection';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider } from '@/database/DatabaseProvider';
import RootNavigation from '@/navigation';
import ServerStatusBar from '@/components/ServerStatusBar';
import { BrandLockup } from '@/components/Brand';
import { useConfigStore } from '@/store/configStore';
import { T } from '@/theme';
import { useLanguageStore, useTranslation } from '@/i18n';

LogBox.ignoreLogs(HANDLED_SESSION_LOGS);

export default function App() {
  const { isLoaded, loadConfig } = useConfigStore();
  const languageLoaded = useLanguageStore(state => state.isLoaded);
  const loadLanguage = useLanguageStore(state => state.loadLanguage);
  const { t } = useTranslation();

  useEffect(() => {
    loadConfig();
    void loadLanguage();
  }, [loadConfig, loadLanguage]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {!isLoaded || !languageLoaded ? (
          // Брендированный сплэш вместо пустого экрана: загрузка конфига
          // сервера может занять заметное время на холодном старте.
          <View style={styles.splash}>
            <BrandLockup subtitle={languageLoaded ? t('auth.brandCaption') : undefined} />
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
