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
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore, UserRole } from '@/store/authStore';
import { AuthStackParamList } from '@/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

const ROLES: { label: string; value: UserRole; icon: string }[] = [
  { label: 'Подрядчик', value: 'CONTRACTOR', icon: '' },
  { label: 'Кладовщик', value: 'STOREKEEPER', icon: '' },
  { label: 'Технадзор', value: 'TECH_SUPERVISOR', icon: '' },
];

export default function RegisterScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('CONTRACTOR');
  
  const { signUp, isLoading } = useAuthStore();
  const insets = useSafeAreaInsets();

  const handleRegister = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Ошибка', 'Пароль должен быть не менее 6 символов');
      return;
    }

    const { error, needsEmailConfirmation } = await signUp(email, password, fullName, role);
    if (error) {
      Alert.alert('Ошибка регистрации', error);
      return;
    }

    if (needsEmailConfirmation) {
      // Сессии нет — сервер требует подтвердить почту. Раньше на этом месте
      // показывалось «Регистрация прошла успешно», после чего пользователь
      // возвращался на экран входа и не понимал, почему его не пускает.
      Alert.alert(
        'Подтвердите почту',
        `На ${email.trim()} отправлено письмо со ссылкой. Подтвердите адрес и войдите — ` +
          'после входа останется привязать организацию.',
        [{ text: 'Понятно', onPress: () => navigation.goBack() }]
      );
      return;
    }

    // Дальше корневой навигатор сам переключит на привязку организации.
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + T.spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Назад ко входу</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Регистрация</Text>
        <Text style={styles.subtitle}>Создайте аккаунт для работы в системе</Text>

        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>ФИО</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Иван Иванов"
              placeholderTextColor={T.colors.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="example@mail.com"
              placeholderTextColor={T.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Пароль</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••"
              placeholderTextColor={T.colors.textMuted}
              secureTextEntry
            />
          </View>

          <Text style={styles.label}>Ваша роль</Text>
          <View style={styles.rolesContainer}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[
                  styles.roleCard,
                  role === r.value && styles.roleCardActive
                ]}
                onPress={() => setRole(r.value)}
              >
                <Text style={styles.roleIcon}>{r.icon}</Text>
                <Text style={[
                  styles.roleLabel,
                  role === r.value && styles.roleLabelActive
                ]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={T.colors.white} />
            ) : (
              <Text style={styles.buttonText}>Зарегистрироваться</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  scrollContent: {
    padding: 24,
  },
  backBtn: {
    marginBottom: 24,
  },
  backText: {
    color: T.colors.primary,
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: T.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: T.colors.textSecondary,
    marginBottom: 32,
  },
  card: {
    backgroundColor: T.colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: T.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: T.colors.canvas,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: T.colors.textPrimary,
  },
  rolesContainer: {
    flexDirection: 'row',
    gap: T.spacing.sm,
    marginBottom: 32,
  },
  roleCard: {
    flex: 1,
    backgroundColor: T.colors.canvas,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleCardActive: {
    borderColor: T.colors.primary,
    backgroundColor: T.colors.primarySoftStrong,
  },
  roleIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  roleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: T.colors.textMuted,
    textAlign: 'center',
  },
  roleLabelActive: {
    color: T.colors.primary,
  },
  button: {
    backgroundColor: T.colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    shadowColor: T.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: T.colors.textOnBrand,
    fontSize: 18,
    fontWeight: '700',
  },
});
