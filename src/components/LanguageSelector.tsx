import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLanguageStore, useTranslation } from '@/i18n';
import { LANGUAGES } from '@/i18n/messages';
import { ECO as E } from '@/theme/ecopro';
import { Icon } from './Icon';

export default function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const { language, t } = useTranslation();
  const setLanguage = useLanguageStore(state => state.setLanguage);
  const storageError = useLanguageStore(state => state.storageError);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.language')}: ${LANGUAGES.find(item => item.code === language)?.label}`}
      accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={styles.trigger}>
      <Icon name="translate" size={18} color={E.blue} /><Text style={styles.code}>{language.toUpperCase()}</Text>
      <Icon name="chevron-down" size={15} color={E.muted} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setOpen(false)} />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{t('common.language')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close} onPress={() => setOpen(false)}><Icon name="close" size={22} color={E.muted} /></Pressable></View>
          <ScrollView>{LANGUAGES.map(item => <Pressable key={item.code} accessibilityRole="radio" accessibilityState={{ checked: language === item.code }}
            accessibilityLabel={item.label} style={[styles.option, language === item.code && styles.selected]}
            onPress={() => { void setLanguage(item.code); setOpen(false); }}>
            <Text style={styles.label}>{item.label}</Text><Text style={styles.shortCode}>{item.code.toUpperCase()}</Text>
            {language === item.code ? <Icon name="check" size={21} color={E.blue} /> : <View style={{ width: 21 }} />}
          </Pressable>)}</ScrollView>
          {storageError && <Text accessibilityRole="alert" style={styles.warning}>{t('common.storageWarning')}</Text>}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', gap: 5, alignItems: 'center', minHeight: 44, paddingHorizontal: 10, borderRadius: 9, borderColor: E.line, borderWidth: 1, backgroundColor: E.surface },
  code: { color: E.ink, fontSize: 12, fontWeight: '600' },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.4)' },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '85%', backgroundColor: E.surface, borderRadius: 16, padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: E.ink, fontSize: 19, fontWeight: '600' },
  close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 4, borderRadius: 9 },
  selected: { backgroundColor: E.soft },
  label: { flex: 1, color: E.ink, fontSize: 16 },
  shortCode: { color: E.muted, fontSize: 12 },
  warning: { color: '#B45309', fontSize: 12, lineHeight: 18, marginTop: 8 },
});
