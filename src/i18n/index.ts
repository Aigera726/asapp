import { useCallback } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLanguageState } from './language-state';
import { translate, type TranslationKey, type TranslationParams } from './messages';

export const useLanguageStore = create(createLanguageState(AsyncStorage));

export function useTranslation() {
  const language = useLanguageStore(state => state.language);
  const t = useCallback((key: TranslationKey, params?: TranslationParams) => translate(language, key, params), [language]);
  return { language, t };
}
