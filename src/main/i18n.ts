/**
 * Lightweight i18n for the main process (Electron menus, dialogs, etc.)
 * Reads the same locale JSON files as the renderer.
 */
import zh from '../renderer/i18n/locales/zh.json';
import en from '../renderer/i18n/locales/en.json';

type Translations = Record<string, any>;

const resources: Record<string, Translations> = { zh, en };

let currentLang = 'zh';

export function setLang(lang: string) {
    if (resources[lang]) {
        currentLang = lang;
    }
}

export function getLang(): string {
    return currentLang;
}

/**
 * Get a translated string by dot-notation key.
 * Example: t('menu.file') => '文件' (zh) or 'File' (en)
 */
export function t(key: string): string {
    const parts = key.split('.');
    let val: any = resources[currentLang];
    for (const part of parts) {
        if (val == null) return key;
        val = val[part];
    }
    return typeof val === 'string' ? val : key;
}
