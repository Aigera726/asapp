import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '@/store/authStore';
import { AppStackParamList } from '@/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'Onboarding'>;
};

/**
 * Привязка аккаунта к контрагенту договора.
 *
 * Выбора из списка здесь нет намеренно: erp.contractors закрыт RLS команды
 * УСП, обычный пользователь не видит ни одной карточки, и прежний экран
 * «выбрать существующую» показывал бы пустой список. Привязка идёт по
 * идентификатору контрагента из договора — он же выступает ключом доступа,
 * а БИН/ИИН работает вторым фактором.
 */
export default function OnboardingScreen({ navigation }: Props) {
  const {
    linkToContractor,
    fetchProfile,
    signOut,
    isLoading,
    linkStatus,
    linkComment,
    contractorName,
  } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [contractorId, setContractorId] = useState('');
  const [bin, setBin] = useState('');
  const [checking, setChecking] = useState(false);

  const handleLink = async () => {
    if (!contractorId.trim()) {
      Alert.alert('Ошибка', 'Введите ID контрагента из договора');
      return;
    }

    const { error } = await linkToContractor(contractorId, bin);
    if (error) {
      Alert.alert('Не удалось привязать', error);
    }
    // На успехе навигацию не трогаем: пока нужен онбординг, корневой
    // навигатор содержит единственный экран, и replace('MainTabs') просто
    // не обрабатывался. Обновлённый профиль сам переключит стек.
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await fetchProfile();
    } finally {
      setChecking(false);
    }
  };

  // Заявка подана и ждёт решения администратора. Форму в этом состоянии не
  // показываем: повторная отправка тех же данных ничего не изменит, а
  // пользователь решил бы, что первая попытка не прошла.
  if (linkStatus === 'PENDING') {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.statusIcon}>
          <Icon name="clock-outline" size={40} color={T.colors.warning} />
        </View>
        <Text style={styles.title}>Заявка на рассмотрении</Text>
        <Text style={styles.statusText}>
          {contractorName
            ? `Запрос доступа к «${contractorName}» отправлен администратору. `
            : 'Запрос отправлен администратору. '}
          Как только его подтвердят, работы ваших договоров появятся в приложении.
        </Text>

        <TouchableOpacity
          style={[styles.mainBtn, styles.statusBtn, checking && styles.btnDisabled]}
          onPress={handleCheck}
          disabled={checking}
          activeOpacity={0.8}
        >
          {checking ? (
            <ActivityIndicator color={T.colors.textOnBrand} />
          ) : (
            <Text style={styles.mainBtnText}>Проверить статус</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + T.spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Привязка организации</Text>
        <Text style={styles.subtitle}>
          Чтобы получить работы своих договоров, привяжите аккаунт к организации-подрядчику.
          Заявку подтверждает администратор.
        </Text>

        {linkStatus === 'REJECTED' ? (
          <View style={styles.rejectedCard}>
            <Icon name="close-circle-outline" size={18} color={T.colors.danger} />
            <Text style={styles.rejectedText}>
              Предыдущая заявка отклонена
              {linkComment ? `: ${linkComment}` : '.'} Проверьте данные и попробуйте снова
              или свяжитесь с администратором.
            </Text>
          </View>
        ) : null}

        <View style={styles.hintCard}>
          <Icon name="information-outline" size={18} color={T.colors.info} />
          <Text style={styles.hintText}>
            ID контрагента возьмите из карточки договора в УСП или запросите
            у ПТО. Это длинный идентификатор вида
            {'\n'}
            <Text style={styles.mono}>c1000000-0000-0000-0000-000000000001</Text>
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>ID контрагента</Text>
            <TextInput
              style={[styles.input, styles.inputMono]}
              value={contractorId}
              onChangeText={setContractorId}
              placeholder="00000000-0000-0000-0000-000000000000"
              placeholderTextColor={T.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>БИН / ИИН организации</Text>
            <TextInput
              style={styles.input}
              value={bin}
              onChangeText={setBin}
              placeholder="12-значный номер"
              placeholderTextColor={T.colors.textMuted}
              keyboardType="number-pad"
              maxLength={12}
            />
            <Text style={styles.fieldHint}>
              Требуется, если БИН заполнен в карточке контрагента — служит
              подтверждением, что организация действительно ваша.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.mainBtn, isLoading && styles.btnDisabled]}
            onPress={handleLink}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={T.colors.textOnBrand} />
            ) : (
              <Text style={styles.mainBtnText}>Привязать</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>
          Организации заводятся в УСП вместе с договором — создать новую из
          мобильного приложения нельзя. Если вашей компании ещё нет в системе,
          обратитесь к ПТО.
        </Text>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  statusIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: T.colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  statusText: {
    fontSize: 15,
    color: T.colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  statusBtn: {
    alignSelf: 'stretch',
  },
  rejectedCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: T.colors.dangerSoft,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  rejectedText: {
    flex: 1,
    fontSize: 13,
    color: T.colors.textSecondary,
    lineHeight: 19,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: T.colors.textPrimary,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: T.colors.textSecondary,
    lineHeight: 24,
    marginBottom: 24,
  },
  hintCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: T.colors.infoSoft,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: T.colors.textSecondary,
    lineHeight: 19,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: T.colors.textPrimary,
  },
  formCard: {
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
    marginBottom: 8,
  },
  input: {
    backgroundColor: T.colors.canvas,
    borderRadius: 12,
    padding: 16,
    color: T.colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  inputMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  fieldHint: {
    fontSize: 12,
    color: T.colors.textMuted,
    lineHeight: 17,
    marginTop: 8,
  },
  mainBtn: {
    backgroundColor: T.colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  mainBtnText: {
    color: T.colors.textOnBrand,
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    fontSize: 13,
    color: T.colors.textMuted,
    lineHeight: 19,
    marginTop: 24,
  },
  signOutBtn: {
    alignItems: 'center',
    marginTop: 24,
    padding: 12,
  },
  signOutText: {
    color: T.colors.textSecondary,
    fontSize: 15,
  },
});
