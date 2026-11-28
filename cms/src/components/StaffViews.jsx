import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { DefaultTemplate } from '@payloadcms/next/templates';
import GuideEditor from './GuideEditor';
import ResearchEditor from './ResearchEditor';
import CommunityUsers from './CommunityUsers';
import Operations from './Operations';
import MobilePreview from './MobilePreview';
import Dashboard from './Dashboard';
import SiteTraffic from './SiteTraffic';
import { readSiteTraffic } from '../ops/site-traffic.mjs';

// Payload custom views also support public pages. Desk views require a current staff session.
function requireStaff({ initPageResult, searchParams }, page, keys) {
  const staff = initPageResult.req.user;
  if (
    staff?.collection === 'staff' &&
    ['owner', 'operator'].includes(staff.role) &&
    initPageResult.permissions.canAccessAdmin
  )
    return staff;
  const target = new URL(page ? '/admin/' + page : '/admin', 'https://preview.invalid');
  for (const key of keys) {
    const value = searchParams?.[key];
    if (typeof value === 'string' && value.length <= 180) target.searchParams.set(key, value);
  }
  redirect('/admin/login?redirect=' + encodeURIComponent(target.pathname + target.search));
}
async function DashboardTraffic({ pending }) {
  try {
    return <SiteTraffic snapshot={await pending} />;
  } catch {
    return <SiteTraffic error="暂时无法读取访问统计。" />;
  }
}
export function DashboardView(props) {
  requireStaff(props, '', []);
  const result = readSiteTraffic();
  return <Dashboard>
    {result instanceof Promise ? (
      <Suspense fallback={<SiteTraffic loading />}>
        <DashboardTraffic pending={result} />
      </Suspense>
    ) : <SiteTraffic snapshot={result} />}
  </Dashboard>;
}
function DeskLayout({ view, children }) {
  const { req, permissions, visibleEntities, locale } = view.initPageResult;
  return (
    <DefaultTemplate
      req={req} payload={req.payload} i18n={req.i18n} locale={locale}
      permissions={permissions} visibleEntities={visibleEntities}
      params={view.params} searchParams={view.searchParams} user={view.user}
    >
      {children}
    </DefaultTemplate>
  );
}
export function UsersView(props) {
  const staff = requireStaff(props, 'community-users', ['user', 'admin']);
  return <DeskLayout view={props}><CommunityUsers isOwner={staff.role === 'owner'} /></DeskLayout>;
}
export function OperationsView(props) {
  requireStaff(props, 'operations', ['tab', 'event', 'filter', 'category', 'source', 'author', 'page', 'edit', 'new']);
  return <DeskLayout view={props}><Operations initialTab={props.searchParams?.tab} /></DeskLayout>;
}
export function PreviewView(props) {
  requireStaff(props, 'content-preview', ['key']);
  return <MobilePreview />;
}

export function GuideView(props) {
  requireStaff(props, 'guide', []);
  return <DeskLayout view={props}><GuideEditor /></DeskLayout>;
}
export function ResearchView(props) {
  requireStaff(props, 'research', []);
  return <DeskLayout view={props}><ResearchEditor /></DeskLayout>;
}
