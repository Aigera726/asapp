import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { T } from '@/theme';

/**
 * Фирменный знак AS-APP.
 *
 * Отрисован средствами RN, а не картинкой: логотип нужен в трёх размерах на
 * разных фонах, и вектор из View/Text не даёт ни размытия, ни лишних ассетов.
 * Геометрия — квадрат с фирменным синим и янтарной засечкой AS Group.
 */

type Size = 'sm' | 'md' | 'lg';

const MARK: Record<Size, { box: number; radius: number; label: number; bar: number }> = {
  sm: { box: 36, radius: 10, label: 15, bar: 3 },
  md: { box: 56, radius: 16, label: 22, bar: 4 },
  lg: { box: 80, radius: 22, label: 32, bar: 5 },
};

export function BrandMark({ size = 'md', style }: { size?: Size; style?: ViewStyle }) {
  const m = MARK[size];
  return (
    <View
      style={[
        styles.mark,
        { width: m.box, height: m.box, borderRadius: m.radius },
        size === 'lg' && T.shadow.raised,
        style,
      ]}
    >
      <Text style={[styles.markLabel, { fontSize: m.label }]}>AS</Text>
      <View style={[styles.markBar, { height: m.bar, borderRadius: m.bar / 2 }]} />
    </View>
  );
}

/** Текстовый логотип: «AS» фирменным синим-светлым, «-APP» янтарным. */
export function BrandWordmark({
  fontSize = 28,
  style,
}: {
  fontSize?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <Text style={[styles.wordmark, { fontSize }]}>
        AS<Text style={styles.wordmarkAccent}>-APP</Text>
      </Text>
    </View>
  );
}

/** Знак + название + подпись — для экрана входа и онбординга. */
export function BrandLockup({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.lockup}>
      <BrandMark size="lg" />
      <BrandWordmark fontSize={32} style={styles.lockupWordmark} />
      {subtitle ? <Text style={styles.lockupSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: T.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  markLabel: {
    color: T.colors.white,
    fontWeight: '900',
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  markBar: {
    width: '46%',
    backgroundColor: T.colors.accentFill,
    marginTop: 3,
  },
  wordmark: {
    color: T.colors.brand,
    fontWeight: '900',
    letterSpacing: 1,
  },
  wordmarkAccent: {
    color: T.colors.accent,
  },
  lockup: {
    alignItems: 'center',
  },
  lockupWordmark: {
    marginTop: T.spacing.lg,
  },
  lockupSubtitle: {
    marginTop: T.spacing.xs,
    color: T.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
});
