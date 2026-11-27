import { useLanguage } from '../Language';
import { LOCALES } from '../i18n/translate';
import ChoiceMenu from './ChoiceMenu';

const LANGUAGE_DETAILS = {
  'zh-Hans': { symbol: '中', description: 'Simplified Chinese' },
  'zh-Hant': { symbol: '繁', description: 'Traditional Chinese' },
  en: { symbol: 'EN' },
};
const languageOptions = LOCALES.map(item => ({ ...item, ...LANGUAGE_DETAILS[item.id], shortLabel: LANGUAGE_DETAILS[item.id].symbol, lang: item.id }));

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  return <ChoiceMenu shineOnInteraction className="language-switcher--short" label={t('切换语言')}
    value={locale} options={languageOptions} onChange={setLocale} />;
}
