import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore, UserRole } from '@/store/authStore';
import { getRoleLabel } from '@/lib/roleLabels';
import { AuthStackParamList } from '@/navigation';
import { notify } from '@/lib/alert';
import { A, AuthLayout, AuthField, AuthButton, authStyles } from '@/components/AuthLayout';
import { Icon, IconName } from '@/components/Icon';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

/**
 * Формат адреса проверяем на клиенте, чтобы опечатка не доходила до сервера:
 * там она превращается в занятый навсегда email, войти под которым нельзя.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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


  const handleRegister = async () => {
    // Тот же trim, что и на входе (LoginScreen): иначе пробел на конце давал
    // аккаунт с одним адресом, а войти пользователь пытался с другим.
    const cleanEmail = email.trim();

    if (!fullName.trim() || !cleanEmail || !password) {
      notify('Ошибка', 'Заполните все поля');
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      notify('Ошибка', 'Проверьте адрес электронной почты');
      return;
    }
    if (password.length < 6) {
      notify('Ошибка', 'Пароль должен быть не менее 6 символов');
      return;
    }

    const { error, roleMismatch } = await signUp(cleanEmail, password, fullName, role);
    if (error) {
      notify('Ошибка регистрации', error);
      return;
    }

    if (roleMismatch) {
      // У аккаунта уже был профиль, и register_profile не стал перезаписывать
      // роль — её мог задать администратор УСП. Раньше расхождение проходило
      // молча: пользователь выбирал «Технадзор», приёмки предписаний не
      // получал и не знал, почему.
      notify(
        'Роль отличается от выбранной',
        `Для этого аккаунта в системе уже задана роль «${getRoleLabel(roleMismatch)}». ` +
          'Выбранная в форме роль не применилась — если это ошибка, обратитесь к администратору.'
      );
      return;
    }

    // Дальше корневой навигатор сам переключит на привязку организации.
  };

  const roleIcons: Record<string, IconName> = { CONTRACTOR: 'hard-hat', STOREKEEPER: 'package-variant-closed', TECH_SUPERVISOR: 'shield-check-outline' };
  return (
    <AuthLayout title="Создать аккаунт" subtitle="Присоединяйтесь к команде AS Group." onBack={() => navigation.goBack()}>
      <AuthField label="Имя и фамилия" icon="account-outline" value={fullName} onChangeText={setFullName} placeholder="Иван Иванов" autoComplete="name" textContentType="name" />
      <AuthField label="Email" icon="email-outline" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" />
      <AuthField label="Пароль" icon="lock-outline" value={password} onChangeText={setPassword} placeholder="Не менее 6 символов" secureTextEntry textContentType="newPassword" autoComplete="new-password" />
      <Text style={styles.label}>Ваша роль</Text>
      <View style={styles.roles}>{ROLES.map(r => <TouchableOpacity key={r.value} accessibilityRole="radio" accessibilityState={{ checked: role === r.value }} accessibilityLabel={r.label} style={[styles.role, role === r.value && styles.selected]} onPress={() => setRole(r.value)}>
        <Icon name={roleIcons[r.value]} size={23} color={role === r.value ? A.blue : A.muted} />
        <Text style={[styles.roleLabel, role === r.value && { color: A.blue }]}>{r.label}</Text>
      </TouchableOpacity>)}</View>
      <AuthButton title="Зарегистрироваться" busy={isLoading} onPress={handleRegister} />
      <TouchableOpacity accessibilityRole="button" style={authStyles.link} onPress={() => navigation.goBack()}><Text style={authStyles.linkText}>Уже есть аккаунт? <Text style={authStyles.accent}>Войти</Text></Text></TouchableOpacity>
    </AuthLayout>
  );
}
const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', color: A.ink, marginBottom: 9 },
  roles: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  role: { flex: 1, paddingVertical: 15, paddingHorizontal: 3, borderWidth: 1, borderColor: A.line, backgroundColor: A.surface, borderRadius: 10, alignItems: 'center', gap: 9 },
  selected: { backgroundColor: A.soft, borderColor: A.blue },
  roleLabel: { fontSize: 11, color: A.muted, fontWeight: '500', textAlign: 'center' },
});
