import NavigationAccount from '../community/account/NavigationAccount';
import StaggeredMenu from '../StaggeredMenu';
import { ThemeToggle } from '../Theme';
import LanguageSwitcher from './LanguageSwitcher';
import { menu } from '../data/menu';
import { useLanguage } from '../Language';
import SpecularButton from '../SpecularButton';
import { pageLocation, returnDestination } from '../community/account/navigation';

const MENU_COLORS = ['var(--menu-layer-one)', 'var(--menu-layer-two)', 'var(--menu-layer-three)'];

export function SiteReturn({ fallback = '/', className = '' }) {
  const { t } = useLanguage();
  const href = returnDestination(new URLSearchParams(location.search).get('from'), fallback, pageLocation());
  return <SpecularButton size="sm" shineOnInteraction className={`nav-control site-nav-return ${className}`} href={href}>{t('返回')}</SpecularButton>;
}

export default function SiteNavigation({ standalone = false, textOnly = false, accountUser, accountSection, accountSource, headerBrand, headerTools, backHref, mobileDetail = standalone }) {
  const items = menu.map(item => standalone && item.link.startsWith('#') ? { ...item, link: `/${item.link}` } : item);
  return (
    <StaggeredMenu
      className={mobileDetail ? 'site-navigation--detail' + (headerTools ? '' : ' site-navigation--detail-no-tools') : undefined}
      position="right"
      textOnly={textOnly}
      headerBrand={headerBrand}
      headerReturn={backHref ? <SiteReturn fallback={backHref} /> : undefined}
      items={items}
      displaySocials={false}
      displayItemNumbering={false}
      menuButtonColor="var(--site-ink)"
      openMenuButtonColor="var(--site-ink)"
      changeMenuColorOnOpen={false}
      colors={MENU_COLORS}
      logoHref={standalone ? '/#top' : '#top'}
      accentColor="var(--site-ink)"
      headerActions={<>{headerTools}<NavigationAccount user={accountUser} section={accountSection} fallbackSource={accountSource}/><LanguageSwitcher /><ThemeToggle /></>}
      isFixed
    />
  );
}
