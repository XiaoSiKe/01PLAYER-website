import { useLanguage } from '../Language';
import { LOCALES } from '../i18n/translate';
import ChoiceMenu from './ChoiceMenu';

const LANGUAGE_DETAILS = {
  'zh-Hans': { symbol: '简', description: 'Simplified Chinese' },
  'zh-Hant': { symbol: '繁', description: 'Traditional Chinese' },
  en: { symbol: 'En' },
};
const languageOptions = LOCALES.map(item => ({ ...item, ...LANGUAGE_DETAILS[item.id], lang: item.id }));

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  return <ChoiceMenu shineOnInteraction label={t('切换语言')} value={locale} options={languageOptions} onChange={setLocale}
    icon={<svg className="language-switcher__globe" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" />
    </svg>} />;
}
