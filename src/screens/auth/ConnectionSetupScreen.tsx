import { useTranslation } from '@/i18n';
import LanguageSelector from '@/components/LanguageSelector';
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useConfigStore } from '@/store/configStore';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { T } from '@/theme';
import { A } from '@/components/AuthLayout';
import { notify } from '@/lib/alert';

export default function ConnectionSetupScreen() {
  const { t } = useTranslation();
  const { supabaseUrl, supabaseKey, apiUrl, saveConfig, resetConfig } = useConfigStore();
  const navigation = useNavigation();
  const [url, setUrl] = useState(supabaseUrl || '');
  const [key, setKey] = useState(supabaseKey || '');
  const [api, setApi] = useState(apiUrl || '');
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleSave = async () => {
    if (!url || !key) {
      notify(t('common.error'), t('connection.required'));
      return;
    }
    await saveConfig(url, key, undefined, api);
    notify(t('connection.success'), t('connection.saved'));
    navigation.goBack();
  };

  const handleReset = async () => {
    await resetConfig();
    notify(t('connection.resetTitle'), t('connection.resetDone'));
    navigation.goBack();
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.url && parsed.key) {
        setUrl(parsed.url);
        setKey(parsed.key);
        // apiUrl в QR необязателен: без него регистрация пойдёт на адрес из
        // сборки, как было до появления поля.
        if (parsed.apiUrl) setApi(parsed.apiUrl);
        setShowScanner(false);
        notify(t('connection.qrRead'), t('connection.filled'));
      } else {
        notify(t('common.error'), t('connection.invalidQr'));
      }
    } catch (e) {
      notify(t('common.error'), t('connection.qrJson'));
    }
  };

  if (showScanner) {
    if (!permission) return <View />;
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{t('connection.noCamera')}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>{t('connection.allowCamera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowScanner(false)}>
            <Text style={styles.secondaryButtonText}>{t('common.back')}</Text>
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
          <Text style={styles.primaryButtonText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>✕ {t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('connection.title')}</Text>
        <LanguageSelector />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        <Text style={styles.label}>{t('connection.apiLabel')}</Text>
        <TextInput
          style={styles.input}
          value={api}
          onChangeText={setApi}
          placeholder="https://server.example.com"
          placeholderTextColor={T.colors.textDisabled}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.fieldHint}>
          {t('connection.apiHint')}
        </Text>

        <TouchableOpacity style={styles.qrButton} onPress={() => setShowScanner(true)}>
          <Text style={styles.qrButtonText}>{t('connection.scan')}</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>{t('common.save')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleReset}>
          <Text style={styles.secondaryButtonText}>{t('connection.reset')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: A.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: T.colors.surface },
  backText: { color: T.colors.textMuted, fontSize: 16 },
  headerTitle: { color: T.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  content: { padding: 24, flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  label: { color: T.colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: T.colors.surface, color: T.colors.textPrimary, padding: 16, borderRadius: 12, fontSize: 15, borderWidth: 1, borderColor: T.colors.border },
  fieldHint: { color: T.colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  qrButton: { backgroundColor: A.soft, padding: 16, borderRadius: 12, marginTop: 16, alignItems: 'center' },
  qrButtonText: { color: A.blue, fontSize: 16, fontWeight: '600' },
  spacer: { flex: 1 },
  primaryButton: { backgroundColor: A.blue, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { color: T.colors.textOnBrand, fontSize: 16, fontWeight: '700' },
  secondaryButton: { padding: 16, borderRadius: 12, alignItems: 'center' },
  secondaryButtonText: { color: T.colors.danger, fontSize: 16, fontWeight: '600' },
  cancelScanBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: T.colors.danger, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  title: { fontSize: 22, fontWeight: '700', color: T.colors.textPrimary, marginBottom: 16, textAlign: 'center', marginTop: 40 },
});
