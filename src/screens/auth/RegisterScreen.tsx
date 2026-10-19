import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore, UserRole } from '@/store/authStore';
import { getRoleLabel } from '@/lib/roleLabels';
import { AuthStackParamList } from '@/navigation';
import { notify } from '@/lib/alert';
import { A, AuthLayout, AuthField, AuthButton, authStyles } from '@/components/AuthLayout';
import { Icon, IconName } from '@/components/Icon';
import { useTranslation, useLanguageStore } from '@/i18n';
import { authError, translate } from '@/i18n/messages';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

/**
 * Формат адреса проверяем на клиенте, чтобы опечатка не доходила до сервера:
 * там она превращается в занятый навсегда email, войти под которым нельзя.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES: UserRole[] = ['CONTRACTOR', 'STOREKEEPER', 'TECH_SUPERVISOR'];

export default function RegisterScreen({ navigation }: Props) {
  const { language, t } = useTranslation();
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
      notify(t('common.error'), t('register.required'));
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      notify(t('common.error'), t('register.invalidEmail'));
      return;
    }
    if (password.length < 6) {
      notify(t('common.error'), t('register.shortPassword'));
      return;
    }

    const { error, roleMismatch } = await signUp(cleanEmail, password, fullName, role);
    const selectedLanguage = useLanguageStore.getState().language;
    if (error) {
      notify(translate(selectedLanguage, 'register.errorTitle'), authError(error, selectedLanguage));
      return;
    }

    if (roleMismatch) {
      // У аккаунта уже был профиль, и register_profile не стал перезаписывать
      // роль — её мог задать администратор УСП. Раньше расхождение проходило
      // молча: пользователь выбирал «Технадзор», приёмки предписаний не
      // получал и не знал, почему.
      notify(
        translate(selectedLanguage, 'register.roleMismatchTitle'),
        translate(selectedLanguage, 'register.roleMismatch', { role: getRoleLabel(roleMismatch, selectedLanguage) })
      );
      return;
    }

    // Дальше корневой навигатор сам переключит на привязку организации.
  };

  const roleIcons: Record<string, IconName> = { CONTRACTOR: 'hard-hat', STOREKEEPER: 'package-variant-closed', TECH_SUPERVISOR: 'shield-check-outline' };
  return (
    <AuthLayout title={t('register.title')} subtitle={t('register.subtitle')} onBack={() => navigation.goBack()}>
      <AuthField label={t('register.fullName')} icon="account-outline" value={fullName} onChangeText={setFullName} placeholder={t('register.namePlaceholder')} autoComplete="name" textContentType="name" />
      <AuthField label={t('auth.email')} icon="email-outline" value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" />
      <AuthField label={t('auth.password')} icon="lock-outline" value={password} onChangeText={setPassword} placeholder={t('register.passwordPlaceholder')} secureTextEntry textContentType="newPassword" autoComplete="new-password" />
      <Text style={styles.label}>{t('register.role')}</Text>
      <View style={styles.roles}>{ROLES.map(value => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ checked: role === value }} accessibilityLabel={getRoleLabel(value, language)} style={[styles.role, role === value && styles.selected]} onPress={() => setRole(value)}>
        <Icon name={roleIcons[value]} size={23} color={role === value ? A.blue : A.muted} />
        <Text style={[styles.roleLabel, role === value && { color: A.blue }]}>{getRoleLabel(value, language)}</Text>
      </TouchableOpacity>)}</View>
      <AuthButton title={t('register.submit')} busy={isLoading} onPress={handleRegister} />
      <TouchableOpacity accessibilityRole="button" style={authStyles.link} onPress={() => navigation.goBack()}><Text style={authStyles.linkText}>{t('register.hasAccount')} <Text style={authStyles.accent}>{t('register.signIn')}</Text></Text></TouchableOpacity>
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
