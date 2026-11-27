import { useEffect, useState } from 'react';
import { useLanguage } from '../../Language';
import { FiUser } from 'react-icons/fi';
import SpecularButton from '../../SpecularButton';
import { communityApi } from '../api';
import { accountLink, pageLocation } from './navigation';
import './navigation.css';

export default function NavigationAccount({ user: supplied, section, fallbackSource }) {
  const { locale } = useLanguage();
  const words =
    locale === 'en'
      ? ['Sign in', 'Sign in or register', 'Player Space']
      : locale === 'zh-Hant'
        ? ['登入', '登入或註冊', '玩家空間']
        : ['登录', '登录 / 注册', '玩家空间'];
  const [session, setSession] = useState(null);
  useEffect(() => {
    if (supplied !== undefined) return;
    let active = true,
      version = 0;
    const refresh = () => {
      const ticket = ++version;
      communityApi('session')
        .then((data) => {
          if (active && ticket === version) setSession(data.user);
        })
        .catch(() => {
          if (active && ticket === version) setSession(null);
        });
    };
    const onStorage = (e) => {
      if (e.key === '01player-account-change') refresh();
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    refresh();
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [supplied]);
  const user = supplied === undefined ? session : supplied;
  const label = user ? words[2] : words[1];
  const href = () => accountLink(user ? 'account' : 'login', fallbackSource || pageLocation(), section);
  const updateHref = (event) => {
    event.currentTarget.href = href();
  };
  return (
    <SpecularButton
      size="sm"
      shineOnInteraction
      className="nav-control site-account-link"
      href={href()}
      onClick={updateHref}
      onContextMenu={updateHref}
      ariaLabel={user ? label + ' · ' + user.name : label}
      title={user ? user.name : label}
    >
      <FiUser aria-hidden="true" />
      <span className="site-account-label">{user ? words[2] : words[0]}</span>
    </SpecularButton>
  );
}
