import React from 'react';
import { Keyboard, Platform, TouchableWithoutFeedback } from 'react-native';

/**
 * Тап по фону убирает клавиатуру — но только на устройстве.
 *
 * На web эта обёртка ломала ввод. TouchableWithoutFeedback ловит клик по
 * полю, которое лежит внутри него, и на отпускании кнопки зовёт
 * Keyboard.dismiss(); в react-native-web это просто снятие фокуса с
 * активного элемента. То есть тот самый клик, которым пользователь ставит
 * курсор в поле, фокус и снимал — печатать получалось только с зажатой ЛКМ.
 *
 * Управлять экранной клавиатурой в браузере и не нужно: её показывает и
 * скрывает сам браузер по фокусу поля.
 */
export function DismissKeyboard({ children }: { children: React.ReactElement }) {
  if (Platform.OS === 'web') return children;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      {children}
    </TouchableWithoutFeedback>
  );
}

export default DismissKeyboard;
