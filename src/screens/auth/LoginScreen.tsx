import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '@/store/authStore';
import { AuthStackParamList } from '@/navigation';
import { T } from '@/theme';
import { BrandLockup } from '@/components/Brand';
import { seedDemoData } from '@/lib/demoData';

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
      Alert.alert('Ошибка', err?.message ?? 'Не удалось подготовить демо-данные');
    } finally {
      setDemoBusy(false);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Ошибка', 'Введите email и пароль');
      return;
    }
    const { error } = await signIn(email.trim(), password);
    if (error) {
      Alert.alert('Ошибка входа', error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          <View style={styles.content}>
            <View style={styles.logoContainer}>
              <BrandLockup subtitle="Управление строительством" />
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Вход в систему</Text>
              <Text style={styles.subtitle}>
                Введите учетные данные для доступа к платформе
              </Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="example@mail.com"
                  placeholderTextColor={T.colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Пароль</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••"
                  placeholderTextColor={T.colors.textMuted}
                  secureTextEntry
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleSignIn}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleSignIn}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={T.colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Войти →</Text>
                )}
              </TouchableOpacity>

              {/*
                Экран регистрации существовал в навигаторе, но попасть в него
                было неоткуда — подрядчик не мог завести аккаунт сам.
              */}
              <TouchableOpacity
                id="register-link"
                style={styles.registerLink}
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.7}
              >
                <Text style={styles.registerText}>
                  Нет аккаунта? <Text style={styles.registerAccent}>Зарегистрироваться</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {__DEV__ ? (
              <TouchableOpacity
                style={styles.demoBtn}
                onPress={handleDemo}
                disabled={demoBusy}
                activeOpacity={0.8}
              >
                {demoBusy ? (
                  <ActivityIndicator color={T.colors.primary} />
                ) : (
                  <Text style={styles.demoBtnText}>
                    Демо-режим · без сервера
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}

            <Text style={styles.footer}>
              Только для авторизованных сотрудников
            </Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  inner: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: T.spacing.xxl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  card: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.xl,
    padding: 28,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  title: {
    ...T.font.h2,
    color: T.colors.textPrimary,
    marginBottom: T.spacing.sm,
  },
  registerLink: {
    alignItems: 'center',
    marginTop: T.spacing.lg,
  },
  registerText: {
    fontSize: 14,
    color: T.colors.textSecondary,
  },
  registerAccent: {
    color: T.colors.primary,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: T.colors.textSecondary,
    lineHeight: 20,
    marginBottom: T.spacing.xxl,
  },
  inputContainer: {
    marginBottom: T.spacing.xl,
  },
  inputLabel: {
    ...T.font.overline,
    fontWeight: '600',
    color: T.colors.textSecondary,
    marginBottom: T.spacing.sm,
  },
  input: {
    backgroundColor: T.colors.canvas,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    padding: T.spacing.lg,
    fontSize: 18,
    color: T.colors.textPrimary,
    letterSpacing: 1,
  },
  button: {
    backgroundColor: T.colors.primary,
    borderRadius: T.radius.md,
    padding: T.spacing.lg,
    alignItems: 'center',
    ...T.shadow.primaryGlow,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: T.colors.textOnBrand,
    fontSize: 16,
    fontWeight: '700',
  },
  demoBtn: {
    marginTop: T.spacing.lg,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.md,
    alignItems: 'center',
    backgroundColor: T.colors.primarySoft,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderStyle: 'dashed',
  },
  demoBtnText: { ...T.font.small, fontWeight: '700', color: T.colors.primary },
  footer: {
    textAlign: 'center',
    color: T.colors.textDisabled,
    fontSize: 12,
    marginTop: T.spacing.xxl,
  },
});
