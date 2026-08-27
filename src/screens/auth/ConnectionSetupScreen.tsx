import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useConfigStore } from '@/store/configStore';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { T } from '@/theme';

export default function ConnectionSetupScreen() {
  const { supabaseUrl, supabaseKey, saveConfig, resetConfig } = useConfigStore();
  const navigation = useNavigation();
  const [url, setUrl] = useState(supabaseUrl || '');
  const [key, setKey] = useState(supabaseKey || '');
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleSave = async () => {
    if (!url || !key) {
      Alert.alert('Ошибка', 'Заполните оба поля');
      return;
    }
    await saveConfig(url, key);
    Alert.alert('Успешно', 'Настройки сохранены. Выйдите из аккаунта (если были авторизованы) для вступления изменений в силу.');
    navigation.goBack();
  };

  const handleReset = async () => {
    await resetConfig();
    Alert.alert('Сброс', 'Восстановлены стандартные настройки');
    navigation.goBack();
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.url && parsed.key) {
        setUrl(parsed.url);
        setKey(parsed.key);
        setShowScanner(false);
        Alert.alert('QR Считан', 'Настройки заполнены');
      } else {
        Alert.alert('Ошибка', 'Неверный формат QR-кода');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'QR-код должен содержать JSON с полями url и key');
    }
  };

  if (showScanner) {
    if (!permission) return <View />;
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Нет доступа к камере</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Дать доступ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowScanner(false)}>
            <Text style={styles.secondaryButtonText}>Назад</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />
        <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setShowScanner(false)}>
          <Text style={styles.primaryButtonText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>✕ Отмена</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Настройки сервера</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>SUPABASE URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://xxx.supabase.co"
          placeholderTextColor={T.colors.textDisabled}
        />

        <Text style={styles.label}>SUPABASE ANON KEY</Text>
        <TextInput
          style={styles.input}
          value={key}
          onChangeText={setKey}
          placeholder="eyJhb..."
          placeholderTextColor={T.colors.textDisabled}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity style={styles.qrButton} onPress={() => setShowScanner(true)}>
          <Text style={styles.qrButtonText}>Сканировать QR-код</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>Сохранить</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleReset}>
          <Text style={styles.secondaryButtonText}>Сбросить по умолчанию</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: T.colors.surface },
  backText: { color: T.colors.textMuted, fontSize: 16 },
  headerTitle: { color: T.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  content: { padding: 20, flex: 1 },
  label: { color: T.colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: T.colors.surface, color: T.colors.textPrimary, padding: 16, borderRadius: 12, fontSize: 15, borderWidth: 1, borderColor: T.colors.border },
  qrButton: { backgroundColor: T.colors.primarySoft, padding: 16, borderRadius: 12, marginTop: 16, alignItems: 'center' },
  qrButtonText: { color: T.colors.primary, fontSize: 16, fontWeight: '600' },
  spacer: { flex: 1 },
  primaryButton: { backgroundColor: T.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { color: T.colors.textOnBrand, fontSize: 16, fontWeight: '700' },
  secondaryButton: { padding: 16, borderRadius: 12, alignItems: 'center' },
  secondaryButtonText: { color: T.colors.danger, fontSize: 16, fontWeight: '600' },
  cancelScanBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: T.colors.danger, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  title: { fontSize: 22, fontWeight: '700', color: T.colors.textPrimary, marginBottom: 16, textAlign: 'center', marginTop: 40 },
});
