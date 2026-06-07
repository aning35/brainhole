import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh.json';
import en from './locales/en.json';

// Get saved language from localStorage, default to 'zh'
const savedLanguage = localStorage.getItem('brainhole-language') || 'zh';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    lng: savedLanguage,
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false,
    },
  });

// Sync language to main process for native menu
if (typeof window !== 'undefined' && window.electronAPI?.setLanguage) {
  window.electronAPI.setLanguage(savedLanguage);
}

export default i18n;
