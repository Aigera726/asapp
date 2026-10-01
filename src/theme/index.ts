/**
 * AS-APP — корпоративная дизайн-система AS Group.
 *
 * Базовые цвета взяты из фирменного знака AS Group:
 *   • #00387E — корпоративный синий (основной)
 *   • #FFA100 — корпоративный янтарный (акцент)
 *
 * Тема СВЕТЛАЯ. Выбор не только стилистический: приложением пользуются на
 * стройплощадке при прямом солнце, где светлый фон с тёмным текстом читается
 * заметно лучше тёмного. Фирменный #00387E на белом даёт контраст ~11:1 и
 * работает как основной интерактивный цвет без осветления.
 *
 * Правило по семантическим цветам: каждый из них используется в коде и как
 * цвет текста, и как заливка. Поэтому значения подобраны «текстобезопасными»
 * (контраст ≥ 4.5:1 на белом), а для ярких плашек и индикаторов есть
 * отдельные токены *Fill.
 */

/** Официальные константы бренда. Не подмешивать сюда UI-оттенки. */
export const BRAND = {
  /** Корпоративный синий из логотипа AS Group. */
  blue: '#00387E',
  /** Корпоративный янтарный из логотипа AS Group. */
  amber: '#FFA100',
  name: 'AS-APP',
  company: 'AS Group',
} as const;

const colors = {
  // ── Поверхности ────────────────────────────────────────────────────────────
  /** Фон приложения — холодный светло-серый, чтобы белые карточки читались. */
  canvas: '#F3F5F8',
  /** Полоса под системной строкой состояния. */
  canvasDeep: '#E8EDF5',
  /** Карточки и основные блоки. */
  surface: '#FFFFFF',
  /** Приподнятая поверхность: модалки, шторки, таб-бар. */
  surfaceRaised: '#FFFFFF',
  /** Вложенные элементы: поле ввода внутри карточки. */
  surfaceSunken: '#F1F4F9',

  // ── Границы ────────────────────────────────────────────────────────────────
  border: '#DBE0E8',
  borderStrong: '#C3CEDE',

  // ── Текст ──────────────────────────────────────────────────────────────────
  textPrimary: '#12161C',
  textSecondary: '#46586F',
  textMuted: '#5B6472',
  /** Плейсхолдеры и неактивное — намеренно низкий контраст. */
  textDisabled: '#97A4B6',
  textOnBrand: '#FFFFFF',

  // ── Бренд / интерактив ─────────────────────────────────────────────────────
  brand: BRAND.blue,
  /** Основной интерактивный цвет. На светлом фоне это сам фирменный синий. */
  primary: '#2451E0',
  primaryPressed: '#002A5E',
  /** Синий для текста и иконок. Совпадает с primary: контраст на белом ~11:1. */
  primaryText: '#2451E0',
  primarySoft: '#E7EDFC',
  primarySoftStrong: 'rgba(0, 56, 126, 0.13)',

  /**
   * Акцент. Для ТЕКСТА — затемнённый янтарный (#FFA100 на белом даёт ~1.9:1
   * и нечитаем). Для ярких плашек и индикаторов брать accentFill.
   */
  accent: '#A05F00',
  accentFill: BRAND.amber,
  accentPressed: '#834E00',
  accentSoft: 'rgba(255, 161, 0, 0.14)',

  // ── Семантика ──────────────────────────────────────────────────────────────
  success: '#0F7A52',
  successFill: '#16A46C',
  successSoft: 'rgba(15, 122, 82, 0.10)',
  successBorder: 'rgba(15, 122, 82, 0.30)',
  warning: '#A05F00',
  warningFill: BRAND.amber,
  warningSoft: 'rgba(255, 161, 0, 0.14)',
  warningBorder: 'rgba(160, 95, 0, 0.30)',
  danger: '#C62828',
  dangerFill: '#E03B3B',
  dangerSoft: 'rgba(198, 40, 40, 0.09)',
  dangerBorder: 'rgba(198, 40, 40, 0.28)',
  info: '#1565C0',
  infoSoft: 'rgba(21, 101, 192, 0.10)',
  neutralSoft: 'rgba(95, 112, 137, 0.10)',
  /** Документы типа «Договор». */
  violet: '#5B3FBF',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(14, 27, 46, 0.45)',
} as const;

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

const font = {
  /** Заголовок экрана. */
  h1: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 21, fontWeight: '700' as const },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
  /** Надзаголовок секции: CAPS + трекинг. */
  overline: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  caption: { fontSize: 11, fontWeight: '600' as const },
  /** Цифры в сводках. */
  metric: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
} as const;

/**
 * Тени. На светлой теме чёрная тень выглядит грязно, поэтому тень
 * тонирована фирменным синим и заметно легче, чем была на тёмной.
 */
const shadow = {
  card: {
    shadowColor: '#0E1B2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  raised: {
    shadowColor: '#0E1B2E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  primaryGlow: {
    shadowColor: BRAND.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  accentGlow: {
    shadowColor: BRAND.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
} as const;

export const T = { colors, spacing, radius, font, shadow, brand: BRAND } as const;

export default T;
