import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInputProps,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from './Icon';
import { T } from '@/theme';
import { ECO as E } from '@/theme/ecopro';
import type { Tone } from '@/lib/domain';

/**
 * Базовые элементы интерфейса AS-APP.
 *
 * Существующие экраны писались независимо, и одна и та же карточка/бейдж/
 * пустое состояние собирались заново с чуть разными отступами и радиусами.
 * Новые разделы собираются из этих примитивов, чтобы список предписаний и
 * список техники выглядели как один продукт.
 *
 * Оформление — как у ERP EcoPro и главного экрана: белые карточки с тонкой
 * рамкой без тени, скругление 12–14, заголовки 600, подписи CAPS с трекингом.
 */

// ── Шапка экрана ─────────────────────────────────────────────────────────────
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  large,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Крупный заголовок — для корневых экранов вкладок. */
  large?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: onBack ? T.spacing.md : insets.top + T.spacing.md }]}>
      {onBack ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon name="chevron-left" size={24} color={E.blue} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.headerTitles}>
        <Text style={large ? styles.headerTitleLarge : styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? null}
    </View>
  );
}

// ── Карточка ─────────────────────────────────────────────────────────────────
export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (onPress) {
    return (
      <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.75}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Бейдж статуса ────────────────────────────────────────────────────────────
export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.text }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// ── Плитка показателя ────────────────────────────────────────────────────────
export function StatTile({
  value,
  label,
  tone,
  onPress,
}: {
  value: string | number;
  label: string;
  tone?: string;
  onPress?: () => void;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.statTile} onPress={onPress} activeOpacity={0.75}>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </Wrapper>
  );
}

// ── Переключатель разделов ───────────────────────────────────────────────────
export function Segmented<V extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: V; label: string; count?: number }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Без flexGrow: 0 горизонтальный ScrollView внутри flex-колонки
      // забирал всю оставшуюся высоту, а чипы растягивались по её кросс-оси
      // и превращались в высокие овалы.
      style={styles.segmentedScroll}
      contentContainerStyle={styles.segmentedRow}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <TouchableOpacity
            key={it.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(it.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {it.label}
            </Text>
            {it.count !== undefined && it.count > 0 ? (
              <View style={[styles.segmentCount, active && styles.segmentCountActive]}>
                <Text style={[styles.segmentCountText, active && styles.segmentCountTextActive]}>
                  {it.count}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Строка списка ────────────────────────────────────────────────────────────
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  meta,
  badge,
  onPress,
  danger,
  subtitleLines = 2,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  subtitleLines?: number;
}) {
  return (
    <Card onPress={onPress} style={danger ? styles.cardDanger : undefined}>
      <View style={styles.rowTop}>
        {icon ? (
          <View style={styles.rowIcon}>
            <Icon name={icon} size={20} color={iconColor ?? E.blue} />
          </View>
        ) : null}
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={subtitleLines}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {badge ?? null}
      </View>
      {meta ? (
        <View style={styles.rowFooter}>
          <Text style={styles.rowMeta}>{meta}</Text>
          {onPress ? <Icon name="chevron-right" size={18} color={T.colors.textDisabled} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

// ── Пустое состояние ─────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={E.blue} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.emptyBtn} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.emptyBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Поля формы ───────────────────────────────────────────────────────────────
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.fieldRequired}> *</Text> : null}
      </Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  multiline,
  ...props
}: TextInputProps & { multiline?: boolean }) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={T.colors.textDisabled}
      style={[styles.input, multiline && styles.inputMultiline, props.style]}
    />
  );
}

/** Выбор одного значения из перечисления — чипами. */
export function Choice<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.choice, active && styles.choiceActive]}
            onPress={() => onChange(o.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Кнопки ───────────────────────────────────────────────────────────────────
export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  tone,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  tone?: 'primary' | 'danger' | 'success';
}) {
  const bg =
    tone === 'danger'
      ? T.colors.danger
      : tone === 'success'
        ? T.colors.success
        : E.blue;
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, { backgroundColor: bg }, (disabled || loading) && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={T.colors.textOnBrand} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={T.colors.textOnBrand} /> : null}
          <Text style={styles.primaryBtnText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.secondaryBtn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon ? <Icon name={icon} size={18} color={E.blue} /> : null}
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Плавающая кнопка добавления. */
export function Fab({ label, onPress, icon = 'plus' }: { label: string; onPress: () => void; icon?: IconName }) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.fab, { bottom: T.spacing.xl + insets.bottom }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Icon name={icon} size={20} color={T.colors.textOnBrand} />
      <Text style={styles.fabText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Пара «подпись — значение» для экранов деталей. */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    paddingHorizontal: T.spacing.xl,
    paddingBottom: 14,
    backgroundColor: E.surface,
    borderBottomWidth: 1,
    borderBottomColor: E.line,
    marginBottom: T.spacing.lg,
  },
  backBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4, color: E.ink },
  headerTitleLarge: { fontSize: 27, lineHeight: 34, fontWeight: '600', letterSpacing: -0.7, color: E.ink },
  headerSubtitle: { fontSize: 13, lineHeight: 19, color: E.muted, marginTop: 2 },

  card: {
    backgroundColor: E.surface,
    borderRadius: 14,
    padding: 17,
    marginBottom: T.spacing.md,
    borderWidth: 1,
    borderColor: E.line,
  },
  cardDanger: { borderColor: T.colors.dangerBorder },

  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: T.radius.pill,
    maxWidth: 160,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  statTile: {
    flex: 1,
    backgroundColor: E.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: E.line,
  },
  statValue: { color: E.ink, fontSize: 25, fontWeight: '500', letterSpacing: -1 },
  statLabel: {
    fontSize: 10,
    color: E.muted,
    marginTop: 4,
    // Длинные подписи переносим только по словам: иначе react-native-web
    // рвёт слово посередине («Отрицательны/х»).
    ...(({ wordBreak: 'keep-all' } as any)),
  },

  segmentedScroll: { flexGrow: 0, flexShrink: 0 },
  segmentedRow: {
    paddingHorizontal: T.spacing.xl,
    gap: T.spacing.sm,
    paddingBottom: T.spacing.lg,
    // Чипы должны быть по высоте контента, а не по высоте контейнера
    alignItems: 'center',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 9,
    backgroundColor: E.surface,
    borderWidth: 1,
    borderColor: E.line,
  },
  segmentActive: { backgroundColor: E.blue, borderColor: E.blue },
  segmentText: { fontSize: 13, fontWeight: '500', color: E.ink },
  segmentTextActive: { color: '#FFFFFF' },
  segmentCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: T.radius.pill,
    backgroundColor: E.soft,
    alignItems: 'center',
  },
  segmentCountActive: { backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  segmentCountText: { fontSize: 10, fontWeight: '600', color: E.blue },
  segmentCountTextActive: { color: '#FFFFFF' },

  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: T.spacing.md },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: E.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: E.ink, lineHeight: 21 },
  rowSubtitle: { fontSize: 12, color: E.muted, marginTop: 4, lineHeight: 18 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: E.line,
  },
  rowMeta: { fontSize: 11, lineHeight: 17, color: E.muted, flex: 1 },

  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: T.spacing.xxl },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: E.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: T.spacing.lg,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: E.ink, textAlign: 'center' },
  emptyText: {
    fontSize: 13,
    color: E.muted,
    textAlign: 'center',
    marginTop: T.spacing.sm,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: T.spacing.xl,
    paddingHorizontal: T.spacing.xl,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: E.blue,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: E.muted, marginBottom: T.spacing.sm },
  fieldRequired: { color: T.colors.danger },
  fieldHint: { fontSize: 11, lineHeight: 16, color: E.muted, marginTop: 6 },
  input: {
    backgroundColor: E.surface,
    borderWidth: 1,
    borderColor: E.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: E.ink,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: 13 },

  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: T.spacing.sm },
  choice: {
    paddingHorizontal: 14,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: E.surface,
    borderWidth: 1,
    borderColor: E.line,
  },
  choiceActive: { backgroundColor: E.soft, borderColor: E.blue },
  choiceText: { fontSize: 13, fontWeight: '500', color: E.ink },
  choiceTextActive: { color: E.blue, fontWeight: '600' },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    borderRadius: 10,
    minHeight: 50,
    paddingHorizontal: T.spacing.xl,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: T.spacing.lg,
    backgroundColor: E.surface,
    borderWidth: 1,
    borderColor: E.line,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: E.blue },
  btnDisabled: { opacity: 0.5 },

  fab: {
    position: 'absolute',
    right: T.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    paddingHorizontal: 18,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: E.blue,
    ...T.shadow.raised,
  },
  fabText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: T.spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0F5',
  },
  infoLabel: { fontSize: 13, color: E.muted },
  infoValue: { fontSize: 13, fontWeight: '600', color: E.ink, flex: 1, textAlign: 'right' },
});
