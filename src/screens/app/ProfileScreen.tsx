import { ScreenHeader } from '@/components/ui';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList } from '@/navigation';
import { T } from '@/theme';
import { notify } from '@/lib/alert';
import { getRoleLabel } from '@/lib/roleLabels';
import { Icon } from '@/components/Icon';

export default function ProfileScreen() {
  const {
    user,
    role,
    firstName,
    lastName,
    contractorId,
    contractorName,
    contractorBin,
    signOut,
    fetchProfile,
  } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  const [saving, setSaving] = useState(false);

  // Профиль и организацию уже загрузил authStore через mobile.my_profile() и
  // mobile.my_contractor(). Свои запросы этот экран делал в public.profiles и
  // public.contractors — таких таблиц в базе УСП нет вовсе (PGRST205), и
  // экран падал на загрузке, а сохранение молча ничего не записывало.
  const [fullName, setFullName] = useState(
    [firstName, lastName].filter(Boolean).join(' ')
  );

  // Стор мог догрузиться после первого рендера — подхватываем, пока поле не
  // тронули руками, иначе ввод пользователя затёрся бы приходом профиля.
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!edited) setFullName([firstName, lastName].filter(Boolean).join(' '));
  }, [firstName, lastName, edited]);

  const handleSave = async () => {
    if (!user) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      notify('Ошибка', 'Укажите ФИО');
      return;
    }

    setSaving(true);
    try {
      // Пишем через RPC: erp.profiles закрыта RLS команды УСП, прямой update
      // не проходит. register_profile делает upsert first_name/last_name и
      // намеренно не трогает role, поэтому p_role здесь не передаём — иначе
      // пришлось бы гонять туда-обратно роль УСП, которую этот экран не
      // вправе менять.
      const [first, ...rest] = trimmedName.split(/\s+/);
      const { error } = await supabase.schema('mobile').rpc('register_profile', {
        p_first_name: first,
        p_last_name: rest.join(' ') || null,
      });
      if (error) throw error;

      // Иначе в сторе осталось бы старое имя до перезахода.
      await fetchProfile({ force: true });
      setEdited(false);
      notify('Успешно', 'Профиль обновлён');
    } catch (e: any) {
      notify('Ошибка', e?.message ?? 'Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Профиль" subtitle="Учётная запись и настройки" onBack={() => navigation.goBack()} right={
        <TouchableOpacity accessibilityLabel="Настройки подключения" onPress={() => navigation.navigate('ConnectionSetup')}>
          <Icon name="cog-outline" size={22} color={T.colors.primary} />
        </TouchableOpacity>
      } />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>ФИО</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={(t) => {
              setEdited(true);
              setFullName(t);
            }}
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

            {/* Только чтение — и это не упрощение, а исправление.
                erp.contractors принадлежит УСП и закрыта RLS: прежний update
                уходил в несуществующую public.contractors и всегда молча
                проваливался. Плюс bin_iin служит вторым фактором при привязке
                к контрагенту (mobile.link_contractor), поэтому менять его из
                приложения нельзя — иначе проверка обходится изнутри. */}
            <Text style={styles.label}>НАЗВАНИЕ КОМПАНИИ</Text>
            <View style={styles.readonlyInput}>
              <Text style={styles.readonlyText}>{contractorName ?? '—'}</Text>
            </View>

            <Text style={styles.label}>БИН / ИИН</Text>
            <View style={styles.readonlyInput}>
              <Text style={styles.readonlyText}>{contractorBin || '—'}</Text>
            </View>

            <Text style={styles.hint}>
              Реквизиты организации заводятся в УСП вместе с договором.
              Изменить их из приложения нельзя — обратитесь к ПТО.
            </Text>
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

        {/* Кнопки удаления здесь больше нет.
            Она делала update profiles set is_deleted = true по
            несуществующей public.profiles — то есть всегда падала, но
            выглядела рабочей. Настоящее удаление аккаунта возможно только
            под service_role (снять запись из auth.users), из приложения
            этого сделать нельзя, а серверной заявки на удаление в схеме
            mobile пока нет. Честная подпись лучше кнопки, которая делает
            вид, что работает. */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Удаление аккаунта</Text>
          <Text style={styles.hint}>
            Аккаунт удаляет администратор — из приложения это сделать нельзя.
            Обратитесь к нему; доступ к работам можно отозвать сразу, не
            удаляя учётную запись.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center', flex: 1, backgroundColor: T.colors.canvas },
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
  hint: { color: T.colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  dangerZone: { borderTopWidth: 1, borderTopColor: T.colors.dangerBorder, paddingTop: 24, marginTop: 16 },
  dangerTitle: { color: T.colors.danger, fontSize: 14, fontWeight: '700', marginBottom: 16, alignSelf: 'center' },
});
