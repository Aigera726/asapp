import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from './Icon';

import { ECO as A } from '@/theme/ecopro';
export { ECO as A } from '@/theme/ecopro';

export function AuthLayout({ children, title, subtitle, onBack }: { children: React.ReactNode; title: string; subtitle: string; onBack?: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[s.page, { paddingTop: insets.top + (wide ? 28 : 24), paddingBottom: insets.bottom + 24 }, wide && s.pageWide]}>
        {wide && <View style={s.hero}>
          <View><Text style={s.heroBrand}>EcoPro<Text style={{ color: A.teal }}>.</Text></Text><Text style={s.eyebrow}>AS GROUP / WORKSPACE</Text></View>
          <View style={s.heroCopy}><Text style={s.heroTitle}>Управляйте сложным.{ '\n' }Работайте просто.</Text><Text style={s.heroText}>Объекты, работы и команда —{ '\n' }в одном пространстве.</Text></View>
          <View style={s.city} accessible={false} pointerEvents="none">
            {[{ h: 100, w: 84 }, { h: 214, w: 112 }, { h: 146, w: 88 }].map((b, i) => <View key={i} style={[s.building, { height: b.h, width: b.w, borderColor: i === 2 ? '#51C8B580' : '#829EDC80' }]}>
              <View style={s.buildingSide} />
              {Array.from({ length: Math.floor(b.h / 27) }, (_, n) => <View key={n} style={s.floor}><View style={s.window} /><View style={s.window} /><View style={s.window} /></View>)}
            </View>)}
          </View>
          <View style={s.heroFooter}><View style={s.dot} /><Text style={s.heroCaption}>ПРОЕКТЫ. ЛЮДИ. РЕЗУЛЬТАТ.</Text></View>
        </View>}
        <View style={[s.formSide, !wide && s.formSideMobile]}>
          <View style={s.form}>
            <View style={s.brandRow}><View style={s.brandIcon}><Icon name="cube-outline" size={24} color="#FFFFFF" /></View><View><Text style={s.brand}>AS<Text style={{ color: A.blue }}> APP</Text></Text><Text style={s.brandCaption}>УПРАВЛЕНИЕ СТРОИТЕЛЬСТВОМ</Text></View></View>
            {onBack && <TouchableOpacity accessibilityRole="button" style={s.back} onPress={onBack}><Icon name="arrow-left" size={18} color={A.muted} /><Text style={s.backText}>Назад ко входу</Text></TouchableOpacity>}
            <Text accessibilityRole="header" style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{subtitle}</Text>
            {children}
            <View style={s.footer}><Icon name="shield-check-outline" size={15} color={A.muted} /><Text style={s.footerText}>Рабочее пространство AS Group</Text></View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthField({ label, icon, secureTextEntry, ...props }: TextInputProps & { label: string; icon: IconName }) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <View style={[s.inputRow, focused && s.inputFocused]}>
      <Icon name={icon} size={20} color={focused ? A.blue : A.muted} />
      <TextInput {...props} accessibilityLabel={label} secureTextEntry={secureTextEntry && !visible} placeholderTextColor="#87909E" style={s.input} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      {secureTextEntry && <TouchableOpacity accessibilityRole="button" accessibilityLabel={visible ? 'Скрыть пароль' : 'Показать пароль'} onPress={() => setVisible(!visible)} style={s.eye}><Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={A.muted} /></TouchableOpacity>}
    </View>
  </View>;
}

export function AuthButton({ title, busy, onPress }: { title: string; busy: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} activeOpacity={0.85} style={[s.button, busy && { opacity: 0.6 }]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={s.buttonText}>{title}</Text><Icon name="arrow-right" size={19} color="#FFFFFF" /></>}</TouchableOpacity>;
}

export const authStyles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  linkText: { fontSize: 14, color: A.muted, textAlign: 'center', lineHeight: 22 },
  accent: { color: A.blue, fontWeight: '600' },
  secondary: { minHeight: 48, borderWidth: 1, borderColor: A.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 16, backgroundColor: A.surface },
  secondaryText: { color: A.muted, fontSize: 14, fontWeight: '500' },
  note: { fontSize: 13, lineHeight: 20, color: A.muted, marginBottom: 18 },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: A.paper },
  page: { flexGrow: 1, paddingHorizontal: 24, alignItems: 'center' },
  pageWide: { flexDirection: 'row', alignItems: 'stretch', gap: 40, paddingHorizontal: 28, maxWidth: 1440, width: '100%', alignSelf: 'center' },
  hero: { flex: 1, backgroundColor: A.navy, borderRadius: 24, padding: 40, minHeight: 650, overflow: 'hidden', justifyContent: 'space-between' },
  heroBrand: { color: '#FFFFFF', fontSize: 28, fontWeight: '600', letterSpacing: -1 },
  eyebrow: { color: '#A7B8D7', fontSize: 10, letterSpacing: 2, marginTop: 10 },
  heroCopy: { marginTop: 52, marginBottom: 32 },
  heroTitle: { color: '#FFFFFF', fontSize: 34, lineHeight: 43, fontWeight: '500', letterSpacing: -0.8 },
  heroText: { color: '#BECBE2', fontSize: 15, lineHeight: 25, marginTop: 22 },
  city: { height: 250, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 16, marginTop: 12 },
  building: { borderWidth: 1, backgroundColor: '#2451E01A', transform: [{ skewY: '-12deg' }], paddingHorizontal: 7, justifyContent: 'space-evenly' },
  buildingSide: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '25%', backgroundColor: '#ABC5FF0B', borderLeftWidth: 1, borderLeftColor: '#829EDC55' },
  floor: { height: 1, backgroundColor: '#829EDC55', flexDirection: 'row', justifyContent: 'space-evenly' },
  window: { width: 1, height: 24, backgroundColor: '#829EDC44' },
  heroFooter: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 28 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: A.teal },
  heroCaption: { fontSize: 9, letterSpacing: 1.6, color: '#A7B8D7' },
  formSide: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 26 },
  formSideMobile: { width: '100%', paddingVertical: 12 },
  form: { width: '100%', maxWidth: 420 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 42 },
  brandIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: A.blue },
  brand: { fontSize: 23, fontWeight: '600', letterSpacing: -0.8, color: A.ink },
  brandCaption: { fontSize: 8, letterSpacing: 1.2, color: A.muted, marginTop: 4 },
  title: { fontSize: 29, fontWeight: '500', letterSpacing: -0.7, color: A.ink, marginBottom: 10 },
  subtitle: { fontSize: 14, lineHeight: 22, color: A.muted, marginBottom: 30 },
  field: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '500', color: A.ink, marginBottom: 9 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 15, backgroundColor: A.surface, borderWidth: 1, borderColor: A.line, borderRadius: 10, minHeight: 54 },
  inputFocused: { borderColor: A.blue },
  input: { flex: 1, minWidth: 0, paddingVertical: 15, paddingRight: 12, fontSize: 16, color: A.ink, ...Platform.select({ web: { outlineStyle: 'none' as any } }) },
  eye: { width: 46, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 54, backgroundColor: A.blue, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  back: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  backText: { color: A.muted, fontSize: 13 },
  footer: { marginTop: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  footerText: { fontSize: 11, color: A.muted },
});
