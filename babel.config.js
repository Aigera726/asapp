module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // Отключаем декораторы, которые преset подключает сам: нам нужно
          // управлять порядком плагинов (см. ниже).
          decorators: false,
        },
      ],
      'nativewind/babel',
    ],
    plugins: [
      // ── Декораторы WatermelonDB ────────────────────────────────────────────
      //
      // Порядок здесь критичен. Legacy-декораторы превращают
      //   @field('name') name: string;
      // в поле класса со значением-заглушкой `_initializerWarningHelper(...)`,
      // рассчитывая, что следом transform-class-properties заменит его на
      // `_initializerDefineProperty`. Если class-properties не выполняется
      // (современная цель поддерживает поля класса нативно) или выполняется
      // РАНЬШЕ декораторов, заглушка остаётся в коде и любое создание записи
      // падает с «Decorating class property failed» — то есть модели
      // WatermelonDB перестают работать целиком.
      //
      // Плагины из babel.config.js выполняются раньше плагинов пресета,
      // поэтому оба объявлены здесь явно и в нужной последовательности:
      // сначала декораторы, потом поля класса.
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],

      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@/components': './src/components',
            '@/screens': './src/screens',
            '@/navigation': './src/navigation',
            '@/store': './src/store',
            '@/database': './src/database',
            '@/lib': './src/lib',
            '@/hooks': './src/hooks',
            '@/types': './src/types',
          },
        },
      ],
    ],
  };
};
