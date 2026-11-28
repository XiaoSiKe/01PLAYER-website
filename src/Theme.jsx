import { useLanguage } from './Language';
import { ThemeSwitch } from './ThemeControl';
import SpecularButton from './SpecularButton';

export { ThemeProvider, useTheme } from './ThemeControl';

export function ThemeToggle() {
  const { t } = useLanguage();
  return <ThemeSwitch translate={t} renderButton={({ label, toggleTheme, icon }) => (
    <SpecularButton size="sm" shineOnInteraction className="theme-toggle nav-control nav-control--icon"
      ariaLabel={label} title={label} onClick={toggleTheme}>{icon}</SpecularButton>
  )} />;
}
