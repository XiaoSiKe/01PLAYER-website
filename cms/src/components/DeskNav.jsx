'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth, useNav, usePreferences, useWindowInfo } from '@payloadcms/ui';
import { PREFERENCE_KEYS } from 'payload/shared';
import { FiActivity, FiAward, FiBookOpen, FiCalendar, FiChevronsLeft, FiGrid, FiImage, FiLayers, FiLogOut, FiMenu, FiUser, FiUsers } from 'react-icons/fi';
import { operationsName } from '../branding.mjs';
import { ClubBrand, ThemeSwitch } from './OfficialUI';
import { deskHref, deskSections, deskTabs, sectionForTab } from './desk';
import { useDeskLanguage } from './DeskLanguage';

const icons = { events: FiCalendar, projects: FiLayers, photos: FiImage, status: FiActivity };

export default function DeskNav() {
  const { t } = useDeskLanguage();
  const path = usePathname();
  const requestedTab = useSearchParams().get('tab');
  const tab = Object.hasOwn(deskTabs, requestedTab) ? requestedTab : 'events';
  function link(href, label, Icon, current) {
    const samePage = href.split('?')[0] === path;
    const Element = samePage ? 'a' : Link;
    return (
      <Element key={href} href={href} {...(samePage ? {} : { prefetch: false })}
        className="op-nav__link" aria-current={current ? 'page' : undefined}>
        <Icon aria-hidden="true" />
        <span>{t(label)}</span>
      </Element>
    );
  }
  function sectionLink(key) {
    return link(deskHref(key), deskSections[key].label, icons[key], path === '/admin/operations' && sectionForTab(tab) === key);
  }
  return (
    <div className="op-nav">
      <a className="op-nav__brand" href="https://club.01aiedu.com/" aria-label={t('零一玩家官网')}>
        <ClubBrand />
      </a>
      {link('/admin', operationsName, FiGrid, path === '/admin')}
      <div className="op-nav__section" role="group" aria-label={t('社区运营')}>
        <span className="op-nav__label" aria-hidden="true">{t('社区运营')}</span>
        {['events', 'projects', 'status'].map(sectionLink)}
        {link('/admin/community-users', '玩家管理', FiUsers, path === '/admin/community-users')}
        {sectionLink('photos')}
        {link('/admin/research', '零一科研与竞赛', FiAward, path === '/admin/research')}
        {link('/admin/guide', '地球生存攻略', FiBookOpen, path === '/admin/guide')}
      </div>
    </div>
  );
}

function useChangeNav() {
  const { setNavOpen } = useNav();
  const { setPreference } = usePreferences();
  const { breakpoints: { l: compact } } = useWindowInfo();
  return (open, focusTarget) => {
    setNavOpen(open);
    if (!compact) void setPreference(PREFERENCE_KEYS.NAV, { open }, true);
    requestAnimationFrame(() => document.querySelector(focusTarget)?.focus());
  };
}

export function DeskNavExpand() {
  const { t } = useDeskLanguage();
  const { hydrated, navOpen } = useNav();
  const changeNav = useChangeNav();
  if (!hydrated || navOpen) return null;
  return (
    <button type="button" className="op-nav__expand" aria-label={t('展开导航')} title={t('展开导航')}
      onClick={() => changeNav(true, '.op-nav__brand')}>
      <FiMenu aria-hidden="true" />
    </button>
  );
}

export function DeskAccountControls() {
  const { user } = useAuth();
  const { language, t, toggleLanguage } = useDeskLanguage();
  const languageLabel = language === 'en' ? t('切换到中文') : '切换到英文';
  const changeNav = useChangeNav();
  return (
    <div className="op-nav__account">
      <a href={user?.id ? '/admin/community-users?admin=' + encodeURIComponent(user.id) : '/admin/community-users'}
        className="op-nav__link op-nav__profile">
        <FiUser aria-hidden="true" />
        <span>{user?.email || t('我的账号')}</span>
      </a>
      <Link className="nav__log-out" href="/admin/logout" prefetch={false} aria-label={t('登出')}>
        <FiLogOut aria-hidden="true" />
      </Link>
      <div className="op-nav__footer">
        <button className="op-nav__link op-nav__collapse" type="button"
          onClick={() => changeNav(false, '.op-nav__expand')}>
          <FiChevronsLeft aria-hidden="true" />
          <span>{t('收起导航')}</span>
        </button>
        <ThemeSwitch translate={t} />
        <button className="theme-toggle op-nav__language" type="button" onClick={toggleLanguage}
          aria-label={languageLabel} title={languageLabel}>
          {language === 'en' ? 'EN' : '中'}
        </button>
      </div>
    </div>
  );
}
