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
    overrides: [
      {
        // ── Декораторы WatermelonDB ────────────────────────────────────────
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
        // Ограничено моделями WatermelonDB: применённый глобально, этот порядок
        // ломает `declare class` поля в TS-исходниках других пакетов
        // (например expo-file-system), которым нужен обычный порядок —
        // сначала transform-typescript, потом class-properties.
        test: (filename) => Boolean(filename && filename.replace(/\\/g, '/').includes('/src/database/models/')),
        plugins: [
          ['@babel/plugin-proposal-decorators', { legacy: true }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
        ],
      },
    ],
  };
};
