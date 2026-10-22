import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/i18n';
import { notify } from '@/lib/alert';
import { prepareReportImage } from '@/lib/report-image';
import { Icon } from './Icon';
import { ECO as E } from '@/theme/ecopro';

type Props = { value: string | null; onChange: (uri: string | null) => void; disabled?: boolean };

export default function ReportPhotoInput({ value, onChange, disabled = false }: Props) {
  const { t } = useTranslation(), insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false), [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false), busyRef = useRef(false), camera = useRef<CameraView>(null);
  useEffect(() => {
    if (!cameraOpen || ready || failed) return;
    const timeout = setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(timeout);
  }, [cameraOpen, ready, failed]);

  const openCamera = async () => {
    if (disabled || busyRef.current) return;
    Keyboard.dismiss();
    if (Platform.OS === 'web' && typeof window !== 'undefined' && !window.isSecureContext) {
      notify(t('common.error'), t('photo.secureCamera'));
      return;
    }
    busyRef.current = true; setBusy(true);
    try {
      const granted = permission?.granted || (await requestPermission()).granted;
      if (!granted) { notify(t('report.noCameraTitle'), t('report.noCamera')); return; }
      setReady(false); setFailed(false); setCameraOpen(true);
    } catch { notify(t('common.error'), t('delivery.camera')); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const fromGallery = async () => {
    if (disabled || busyRef.current) return;
    Keyboard.dismiss();
    busyRef.current = true; setBusy(true); setCameraOpen(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
      if (!result.canceled && result.assets?.[0]) onChange(await prepareReportImage(result.assets[0]));
    } catch { notify(t('common.error'), t('photo.galleryError')); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const capture = async () => {
    if (!ready || failed || !camera.current || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const image = await camera.current.takePictureAsync({ quality: 0.85 });
      if (!image) throw new Error('mobile_photo_unavailable');
      const uri = await prepareReportImage(image);
      onChange(uri); setCameraOpen(false);
    } catch { notify(t('common.error'), t('delivery.camera')); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return <View style={styles.root}>
    {value && <View style={styles.preview}>
      <Image source={{ uri: value }} style={styles.thumbnail} resizeMode="contain" accessibilityLabel={t('report.photoAttached')} />
      <View style={styles.previewFooter}>
        <Text style={styles.attached}>{t('report.photoAttached')}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('photo.remove')} disabled={disabled || busy} onPress={() => onChange(null)} style={styles.remove}>
          <Icon name="close" size={20} color={E.blue} /><Text style={styles.link}>{t('photo.remove')}</Text>
        </TouchableOpacity>
      </View>
    </View>}
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" testID="report-camera" disabled={disabled || busy} onPress={openCamera} style={[styles.action, (disabled || busy) && styles.disabled]}>
        <Icon name="camera-outline" size={22} color={E.blue} /><Text style={styles.actionText}>{t('report.takePhoto')}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" testID="report-gallery" disabled={disabled || busy} onPress={fromGallery} style={[styles.action, (disabled || busy) && styles.disabled]}>
        <Icon name="image-outline" size={22} color={E.blue} /><Text style={styles.actionText}>{t('photo.gallery')}</Text>
      </TouchableOpacity>
    </View>
    {busy && <View accessibilityLiveRegion="polite" style={styles.processing}><ActivityIndicator color={E.blue} /><Text style={styles.hint}>{t('photo.preparing')}</Text></View>}
    <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => { if (!busyRef.current) setCameraOpen(false); }}>
      <View style={styles.cameraScreen}>
        <View style={[styles.cameraHeader, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.cameraTitle}>{t('report.takePhoto')}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.close')} disabled={busy} onPress={() => setCameraOpen(false)} style={styles.close}>
            <Icon name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.cameraPreview}>
          {!failed && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} onMountError={() => setFailed(true)} />}
          {(!ready || failed) && <View style={styles.cameraMessage}>
            {!failed && <ActivityIndicator color="#FFFFFF" size="large" />}
            <Text style={styles.cameraHint}>{t(failed ? 'photo.cameraUnavailable' : 'photo.cameraStarting')}</Text>
          </View>}
        </View>
        {/* Native CameraView cannot contain controls. A sibling footer stays visible on short screens and iPhones. */}
        <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity accessibilityRole="button" testID="capture-photo" accessibilityLabel={t('report.capture')} disabled={!ready || failed || busy} onPress={capture} style={[styles.capture, (!ready || failed || busy) && styles.disabled]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="camera-outline" size={25} color="#FFFFFF" />}
            <Text style={styles.captureText}>{t('report.capture')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={fromGallery} style={styles.galleryInCamera}>
            <Text style={styles.cameraHint}>{t('photo.gallery')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 10 }, actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderWidth: 1, borderColor: E.line, borderRadius: 12, backgroundColor: E.surface },
  actionText: { color: E.ink, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  preview: { borderRadius: 12, borderWidth: 1, borderColor: E.line, overflow: 'hidden' }, thumbnail: { width: '100%', height: 180, backgroundColor: E.paper },
  previewFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }, attached: { flex: 1, color: E.ink, fontSize: 13 },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 }, link: { color: E.blue, fontWeight: '600' },
  processing: { flexDirection: 'row', alignItems: 'center', gap: 8 }, hint: { color: E.muted, fontSize: 12 }, disabled: { opacity: 0.45 },
  cameraScreen: { flex: 1, backgroundColor: '#101820' }, cameraHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  cameraTitle: { flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '600' }, close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  cameraPreview: { flex: 1, overflow: 'hidden' }, cameraMessage: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  cameraHint: { color: '#FFFFFF', textAlign: 'center', fontSize: 14, lineHeight: 20 }, controls: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  capture: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, backgroundColor: E.blue, borderRadius: 12 },
  captureText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, galleryInCamera: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
