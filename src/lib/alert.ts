import { Alert, Platform } from 'react-native';

/**
 * Диалог с сообщением, который виден и в браузере.
 *
 * react-native-web не реализует Alert вовсе: его Alert.alert — пустой метод
 * (node_modules/react-native-web/dist/exports/Alert/index.js — `static
 * alert() {}`). В веб-сборке из-за этого не показывалось ни одно сообщение об
 * ошибке: регистрация и вход выглядели так, будто кнопка не работает, и
 * проверить их в браузере было нельзя.
 *
 * На native поведение не меняется — там вызывается тот же Alert.alert.
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    // Кнопок в auth-экранах нет, поэтому нативного окна браузера достаточно.
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
