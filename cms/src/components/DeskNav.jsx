'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Logout, useAuth, useNav, usePreferences, useWindowInfo } from '@payloadcms/ui';
import { PREFERENCE_KEYS } from 'payload/shared';
import { FiActivity, FiCalendar, FiCheckSquare, FiChevronsLeft, FiFileText, FiGrid, FiImage, FiLayers, FiMenu, FiUser, FiUsers } from 'react-icons/fi';
import { operationsName } from '../branding.mjs';
import { ClubBrand, ThemeSwitch } from './OfficialUI';
import { deskTabs } from './desk';

const icons = { events: FiCalendar, registrations: FiCheckSquare, projects: FiLayers, photos: FiImage, status: FiActivity };

export default function DeskNav() {
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
        <span>{label}</span>
      </Element>
    );
  }
  return (
    <div className="op-nav">
      <a className="op-nav__brand" href="https://club.01aiedu.com/" aria-label="零一玩家官网">
        <ClubBrand />
      </a>
      {link('/admin', operationsName, FiGrid, path === '/admin')}
      <div className="op-nav__section" role="group" aria-label="社区运营">
        <span className="op-nav__label" aria-hidden="true">社区运营</span>
        {Object.entries(deskTabs).map(([key, label]) =>
          link('/admin/operations?tab=' + key, label, icons[key], path === '/admin/operations' && tab === key)
        )}
        {link('/admin/community-users', '玩家管理', FiUsers, path === '/admin/community-users')}
      </div>
      <div className="op-nav__section" role="group" aria-label="内容运营">
        <span className="op-nav__label" aria-hidden="true">内容运营</span>
        {link('/admin/collections/sections', '网站内容', FiFileText, path.startsWith('/admin/collections/sections'))}
        {link('/admin/collections/media', '素材库', FiImage, path.startsWith('/admin/collections/media'))}
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
  const { hydrated, navOpen } = useNav();
  const changeNav = useChangeNav();
  if (!hydrated || navOpen) return null;
  return (
    <button type="button" className="op-nav__expand" aria-label="展开导航" title="展开导航"
      onClick={() => changeNav(true, '.op-nav__brand')}>
      <FiMenu aria-hidden="true" />
    </button>
  );
}

export function DeskAccountControls() {
  const { user } = useAuth();
  const changeNav = useChangeNav();
  return (
    <div className="op-nav__account">
      <a href={user?.id ? '/admin/community-users?admin=' + encodeURIComponent(user.id) : '/admin/community-users'}
        className="op-nav__link op-nav__profile">
        <FiUser aria-hidden="true" />
        <span>{user?.email || '我的账号'}</span>
      </a>
      <div className="op-nav__account-actions">
        <Logout />
        <ThemeSwitch />
      </div>
      <button className="op-nav__link op-nav__collapse" type="button"
        onClick={() => changeNav(false, '.op-nav__expand')}>
        <FiChevronsLeft aria-hidden="true" />
        <span>收起导航</span>
      </button>
    </div>
  );
}
