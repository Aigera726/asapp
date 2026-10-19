import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '@/store/authStore';
import { AuthStackParamList } from '@/navigation';
import { isServerConfigured } from '@/lib/supabase';
import { DEMO_BUILD } from '@/lib/demoBuild';
import { notify } from '@/lib/alert';
import { seedDemoData } from '@/lib/demoData';
import { A, AuthLayout, AuthField, AuthButton, authStyles as styles } from '@/components/AuthLayout';
import { useTranslation, useLanguageStore } from '@/i18n';
import { authError, translate } from '@/i18n/messages';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

/**
 * Вход в систему.
 *
 * Выбора сервера здесь нет: список тянулся из таблицы available_servers и
 * стабильно не загружался, оставляя на экране нерабочий контрол. Приложение
 * подключается к серверу по умолчанию из EXPO_PUBLIC_SUPABASE_URL.
 * Ручная настройка подключения (URL/ключ, QR) осталась в Профиль → ⚙️.
 */
export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, isLoading, enterDemoMode } = useAuthStore();
  const [demoBusy, setDemoBusy] = useState(false);

  /** Только dev: посмотреть интерфейс на тестовых данных без сервера. */
  const handleDemo = async () => {
    setDemoBusy(true);
    try {
      await seedDemoData();
      enterDemoMode();
    } catch (err: any) {
      console.error('[Demo] Не удалось подготовить демо-данные', err);
      const language = useLanguageStore.getState().language;
      notify(translate(language, 'common.error'), translate(language, 'login.demoError'));
    } finally {
      setDemoBusy(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      notify(t('common.error'), t('login.required'));
      return;
    }
    const { error } = await signIn(email.trim(), password);
    if (error) {
      const language = useLanguageStore.getState().language;
      notify(translate(language, 'login.errorTitle'), authError(error, language));
    }
  };

  return (
    <AuthLayout title={t('login.title')} subtitle={t('login.subtitle')}>
      <AuthField label={t('auth.email')} icon="email-outline" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" />
      <AuthField label={t('auth.password')} icon="lock-outline" value={password} onChangeText={setPassword} placeholder={t('login.passwordPlaceholder')} secureTextEntry textContentType="password" autoComplete="current-password" returnKeyType="go" onSubmitEditing={handleSignIn} />
      <AuthButton title={t('login.submit')} busy={isLoading} onPress={handleSignIn} />
      <TouchableOpacity accessibilityRole="button" id="register-link" style={styles.link} onPress={() => navigation.navigate('Register')}><Text style={styles.linkText}>{t('login.noAccount')} <Text style={styles.accent}>{t('login.register')}</Text></Text></TouchableOpacity>
      {!isServerConfigured() && <Text style={styles.note}>{t('login.noServer')}</Text>}
      {DEMO_BUILD && <TouchableOpacity accessibilityRole="button" style={styles.secondary} disabled={demoBusy} onPress={handleDemo}>{demoBusy ? <ActivityIndicator color={A.blue} /> : <Text style={styles.secondaryText}>{t('login.demo')}</Text>}</TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" style={styles.link} onPress={() => navigation.navigate('ConnectionSetup')}><Text style={styles.linkText}>{t('login.connection')}</Text></TouchableOpacity>
    </AuthLayout>
  );
}
