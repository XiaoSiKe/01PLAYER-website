import NavigationAccount from '../community/account/NavigationAccount';
import StaggeredMenu from '../StaggeredMenu';
import { ThemeToggle } from '../Theme';
import LanguageSwitcher from './LanguageSwitcher';
import { menu } from '../data/menu';

const MENU_COLORS = ['var(--menu-layer-one)', 'var(--menu-layer-two)', 'var(--menu-layer-three)'];

export default function SiteNavigation({ standalone = false, textOnly = false, accountUser, accountSection, accountSource, headerBrand, headerTools, mobileDetail = standalone }) {
  const items = menu.map(item => standalone && item.link.startsWith('#') ? { ...item, link: `/${item.link}` } : item);
  return (
    <StaggeredMenu
      className={mobileDetail ? 'site-navigation--detail' + (headerTools ? '' : ' site-navigation--detail-no-tools') : undefined}
      position="right"
      textOnly={textOnly}
      headerBrand={headerBrand}
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
