import React from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { T } from '@/theme';

/**
 * Иконки интерфейса.
 *
 * Раньше вся иконография была эмодзи (🏗 📋 ✍️). Эмодзи рисуются шрифтом
 * системы: на iOS и Android они выглядят по-разному, не наследуют цвет и
 * читаются как потребительский, а не рабочий инструмент. MaterialCommunityIcons
 * даёт единый набор в одном стиле, включая строительную тематику
 * (excavator, crane, hard-hat), и красится темой.
 */

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({
  name,
  size = 22,
  color = T.colors.textSecondary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export default Icon;
