import {
  createContext,
  useCallback,
  useContext as useReactContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Translations = Record<string, string>;

type I18NContextValue = {
  _t: (key: string) => string;
  setLanguage: (lang: string) => void;
  currentLanguage: string;
};

const I18NContext = createContext<I18NContextValue | null>(null);

const LANGUAGE_STORAGE_KEY = "i18n_language";
const DEFAULT_LANGUAGE = "en";

// Cache for loaded translations
const translationCache: Record<string, Translations> = {};

/**
 * Load translations for a given language
 */
async function loadTranslations(lang: string): Promise<Translations> {
  // English is the default - no file needed, return empty object
  if (lang === DEFAULT_LANGUAGE) {
    return {};
  }

  // Return from cache if already loaded
  if (translationCache[lang]) {
    return translationCache[lang];
  }

  try {
    // Fetch translation file from public directory
    const response = await fetch(`/locales/${lang}.json`);

    if (!response.ok) {
      throw new Error(`Failed to load translations: ${response.statusText}`);
    }

    const translationData = await response.json();
    translationCache[lang] = translationData;
    return translationCache[lang];
  } catch (error) {
    console.warn(`Failed to load translations for language: ${lang}`, error);
    // Fallback to English (empty object - keys are used as-is)
    return {};
  }
}

export function I18NProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string>(() => {
    // Get language from localStorage or default to 'en'
    if (typeof window !== "undefined") {
      return localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE;
    }
    return DEFAULT_LANGUAGE;
  });

  const [translations, setTranslations] = useState<Translations>({});

  // Load translations when language changes
  useEffect(() => {
    loadTranslations(language).then((loadedTranslations) => {
      setTranslations(loadedTranslations);
    });
  }, [language]);

  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  }, []);

  const _t = useCallback(
    (key: string): string => {
      // If translation exists, use it; otherwise return the key (English default)
      return translations[key] || key;
    },
    [translations],
  );

  return (
    <I18NContext.Provider value={{ _t, setLanguage, currentLanguage: language }}>
      {children}
    </I18NContext.Provider>
  );
}

export function useI18N(): I18NContextValue {
  const context = useReactContext(I18NContext);
  if (!context) {
    throw new Error("useI18N must be used within an I18NProvider");
  }
  return context;
}
