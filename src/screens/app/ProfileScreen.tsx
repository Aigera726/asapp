import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList } from '@/navigation';
import { T } from '@/theme';
import { getRoleLabel } from '@/lib/roleLabels';
import { Icon } from '@/components/Icon';

export default function ProfileScreen() {
  const { user, role, contractorId, signOut } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [bin, setBin] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      if (profile) setFullName(profile.full_name || '');

      // 2. Fetch contractor if linked
      if (contractorId) {
        // Онбординг пишет БИН в bin_iin, а этот экран читал колонку bin —
        // поле всегда открывалось пустым, а сохранение затирало его в другой
        // колонке. Работаем с bin_iin, как и остальное приложение.
        const { data: contractor, error: contractorError } = await supabase
          .from('contractors')
          .select('company_name, bin_iin')
          .eq('id', contractorId)
          .single();

        if (contractorError) throw contractorError;
        if (contractor) {
          setCompanyName(contractor.company_name || '');
          setBin(contractor.bin_iin || '');
        }
      }
    } catch (e: any) {
      console.error('[Profile] Не удалось загрузить профиль:', e);
      Alert.alert('Ошибка', e?.message ?? 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      Alert.alert('Ошибка', 'Укажите ФИО');
      return;
    }
    if (contractorId && bin.trim() && !/^\d{12}$/.test(bin.trim())) {
      Alert.alert('Ошибка', 'БИН/ИИН должен состоять из 12 цифр');
      return;
    }

    setSaving(true);
    try {
      // supabase-js не бросает исключений: без проверки .error экран
      // показывал «Профиль обновлен» даже когда запись блокировал RLS.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: trimmedName })
        .eq('id', user.id);
      if (profileError) throw profileError;

      if (contractorId) {
        const { error: contractorError } = await supabase
          .from('contractors')
          .update({
            company_name: companyName.trim(),
            bin_iin: bin.trim() || null,
          })
          .eq('id', contractorId);
        if (contractorError) throw contractorError;
      }

      Alert.alert('Успешно', 'Профиль обновлен');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message ?? 'Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Удаление аккаунта',
      'Вы уверены, что хотите безвозвратно удалить свой аккаунт? Отменить это действие будет невозможно.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user) return;
              const { error } = await supabase
                .from('profiles')
                .update({ is_deleted: true })
                .eq('id', user.id);
              if (error) throw error;
              await signOut();
            } catch (e: any) {
              Alert.alert('Ошибка', e?.message ?? 'Не удалось удалить аккаунт');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={T.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Профиль</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ConnectionSetup')}>
          <Icon name="cog-outline" size={22} color={T.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>ФИО</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Иван Иванов"
            placeholderTextColor={T.colors.textDisabled}
          />

          <Text style={styles.label}>РОЛЬ</Text>
          <View style={styles.readonlyInput}>
            <Text style={styles.readonlyText}>{getRoleLabel(role)}</Text>
          </View>
        </View>

        {contractorId && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Реквизиты компании</Text>
            
            <Text style={styles.label}>НАЗВАНИЕ КОМПАНИИ</Text>
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="ТОО Пример"
              placeholderTextColor={T.colors.textDisabled}
            />

            <Text style={styles.label}>БИН / ИИН</Text>
            <TextInput
              style={styles.input}
              value={bin}
              onChangeText={setBin}
              placeholder="123456789012"
              placeholderTextColor={T.colors.textDisabled}
              keyboardType="number-pad"
              maxLength={12}
            />
          </View>
        )}

        <TouchableOpacity 
          style={[styles.primaryButton, saving && styles.disabledBtn]} 
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>{saving ? 'Сохранение...' : 'Сохранить изменения'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={signOut}>
          <Text style={styles.secondaryButtonText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Опасная зона</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={handleDelete}>
            <Text style={styles.dangerButtonText}>Удалить аккаунт</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: T.colors.surface },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 12, padding: 4 },
  backIcon: { color: T.colors.primary, fontSize: 28, lineHeight: 28 },
  headerTitle: { color: T.colors.textPrimary, fontSize: 24, fontWeight: '700' },
  settingsIcon: { fontSize: 24 },
  content: { padding: 20, paddingBottom: 60 },
  card: { backgroundColor: T.colors.surface, padding: 16, borderRadius: 16, marginBottom: 16 },
  cardTitle: { color: T.colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  label: { color: T.colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: T.colors.canvas, color: T.colors.textPrimary, padding: 14, borderRadius: 10, fontSize: 15, borderWidth: 1, borderColor: T.colors.border },
  readonlyInput: { backgroundColor: T.colors.canvas, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: T.colors.border, opacity: 0.7 },
  readonlyText: { color: T.colors.textSecondary, fontSize: 15 },
  primaryButton: { backgroundColor: T.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12, marginBottom: 12 },
  primaryButtonText: { color: T.colors.textOnBrand, fontSize: 16, fontWeight: '700' },
  disabledBtn: { opacity: 0.7 },
  secondaryButton: { padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: T.colors.surfaceSunken, borderWidth: 1, borderColor: T.colors.border, marginBottom: 32 },
  secondaryButtonText: { color: T.colors.textSecondary, fontSize: 16, fontWeight: '600' },
  dangerZone: { borderTopWidth: 1, borderTopColor: T.colors.dangerBorder, paddingTop: 24, marginTop: 16 },
  dangerTitle: { color: T.colors.danger, fontSize: 14, fontWeight: '700', marginBottom: 16, alignSelf: 'center' },
  dangerButton: { padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: T.colors.dangerSoft, borderWidth: 1, borderColor: T.colors.dangerBorder },
  dangerButtonText: { color: T.colors.danger, fontSize: 16, fontWeight: '700' },
});
