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
import type { Tone } from '@/lib/domain';

/**
 * Базовые элементы интерфейса AS-APP.
 *
 * Существующие экраны писались независимо, и одна и та же карточка/бейдж/
 * пустое состояние собирались заново с чуть разными отступами и радиусами.
 * Новые разделы собираются из этих примитивов, чтобы список предписаний и
 * список техники выглядели как один продукт.
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
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon name="chevron-left" size={26} color={T.colors.primary} />
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
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Card onPress={onPress} style={danger ? styles.cardDanger : undefined}>
      <View style={styles.rowTop}>
        {icon ? (
          <View style={styles.rowIcon}>
            <Icon name={icon} size={20} color={iconColor ?? T.colors.primary} />
          </View>
        ) : null}
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
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
        <Icon name={icon} size={30} color={T.colors.textDisabled} />
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
        : T.colors.primary;
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
      {icon ? <Icon name={icon} size={18} color={T.colors.primary} /> : null}
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
    paddingBottom: T.spacing.md,
    backgroundColor: T.colors.canvas,
  },
  backBtn: { marginLeft: -T.spacing.sm },
  headerTitles: { flex: 1 },
  headerTitle: { ...T.font.h2, color: T.colors.textPrimary },
  headerTitleLarge: { ...T.font.h1, color: T.colors.textPrimary },
  headerSubtitle: { ...T.font.small, color: T.colors.textMuted, marginTop: 1 },

  card: {
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    marginBottom: T.spacing.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    ...T.shadow.card,
  },
  cardDanger: { borderColor: T.colors.dangerBorder },

  badge: {
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 3,
    borderRadius: T.radius.sm,
    maxWidth: 150,
  },
  badgeText: { ...T.font.caption, fontSize: 10.5 },

  statTile: {
    flex: 1,
    backgroundColor: T.colors.surface,
    borderRadius: T.radius.md,
    paddingVertical: T.spacing.md,
    paddingHorizontal: T.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  statValue: { ...T.font.metric, color: T.colors.primary },
  statLabel: {
    ...T.font.caption,
    color: T.colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
    // Длинные подписи переносим только по словам: иначе react-native-web
    // рвёт слово посередине («Отрицательны/х»).
    ...(({ wordBreak: 'keep-all' } as any)),
  },

  segmentedScroll: { flexGrow: 0, flexShrink: 0 },
  segmentedRow: {
    paddingHorizontal: T.spacing.xl,
    gap: T.spacing.sm,
    paddingBottom: T.spacing.md,
    // Чипы должны быть по высоте контента, а не по высоте контейнера
    alignItems: 'center',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.sm,
    borderRadius: T.radius.pill,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  segmentActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  segmentText: { ...T.font.small, fontWeight: '600', color: T.colors.textSecondary },
  segmentTextActive: { color: T.colors.textOnBrand },
  segmentCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: T.radius.pill,
    backgroundColor: T.colors.primarySoft,
    alignItems: 'center',
  },
  segmentCountActive: { backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  segmentCountText: { ...T.font.caption, fontSize: 10, color: T.colors.primary },
  segmentCountTextActive: { color: T.colors.textOnBrand },

  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: T.spacing.md },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { ...T.font.bodyStrong, color: T.colors.textPrimary, lineHeight: 20 },
  rowSubtitle: { ...T.font.small, color: T.colors.textMuted, marginTop: 2, lineHeight: 18 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: T.spacing.md,
    paddingTop: T.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
  },
  rowMeta: { ...T.font.caption, color: T.colors.textMuted },

  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: T.spacing.xxl },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: T.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: T.spacing.lg,
  },
  emptyTitle: { ...T.font.h3, color: T.colors.textSecondary, textAlign: 'center' },
  emptyText: {
    ...T.font.small,
    color: T.colors.textMuted,
    textAlign: 'center',
    marginTop: T.spacing.sm,
    lineHeight: 19,
  },
  emptyBtn: {
    marginTop: T.spacing.xl,
    paddingHorizontal: T.spacing.xl,
    paddingVertical: T.spacing.md,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.primarySoft,
  },
  emptyBtnText: { ...T.font.small, fontWeight: '700', color: T.colors.primary },

  field: { marginBottom: T.spacing.lg },
  fieldLabel: { ...T.font.overline, color: T.colors.textSecondary, marginBottom: T.spacing.sm },
  fieldRequired: { color: T.colors.danger },
  fieldHint: { ...T.font.caption, color: T.colors.textMuted, marginTop: T.spacing.xs },
  input: {
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.md,
    fontSize: 16,
    color: T.colors.textPrimary,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: T.spacing.md },

  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: T.spacing.sm },
  choice: {
    paddingHorizontal: T.spacing.lg,
    paddingVertical: T.spacing.sm + 1,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  choiceActive: { backgroundColor: T.colors.primarySoft, borderColor: T.colors.primary },
  choiceText: { ...T.font.small, fontWeight: '600', color: T.colors.textSecondary },
  choiceTextActive: { color: T.colors.primary },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    borderRadius: T.radius.md,
    paddingVertical: T.spacing.lg,
    ...T.shadow.primaryGlow,
  },
  primaryBtnText: { ...T.font.bodyStrong, fontSize: 16, color: T.colors.textOnBrand },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.spacing.sm,
    borderRadius: T.radius.md,
    paddingVertical: T.spacing.md,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.borderStrong,
  },
  secondaryBtnText: { ...T.font.bodyStrong, color: T.colors.primary },
  btnDisabled: { opacity: 0.5 },

  fab: {
    position: 'absolute',
    right: T.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spacing.sm,
    paddingHorizontal: T.spacing.xl,
    paddingVertical: T.spacing.md + 2,
    borderRadius: T.radius.pill,
    backgroundColor: T.colors.primary,
    ...T.shadow.raised,
  },
  fabText: { ...T.font.bodyStrong, color: T.colors.textOnBrand },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: T.spacing.lg,
    paddingVertical: T.spacing.sm,
  },
  infoLabel: { ...T.font.small, color: T.colors.textMuted },
  infoValue: { ...T.font.small, fontWeight: '600', color: T.colors.textPrimary, flex: 1, textAlign: 'right' },
});
