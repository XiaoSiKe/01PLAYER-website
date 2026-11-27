import React from 'react';
import { redirect } from 'next/navigation';
import { DefaultTemplate } from '@payloadcms/next/templates';
import CommunityUsers from './CommunityUsers';
import Operations from './Operations';
import MobilePreview from './MobilePreview';

// Payload custom views also support public pages. These three require a current staff session.
function requireStaff({ initPageResult, searchParams }, page, keys) {
  const staff = initPageResult.req.user;
  if (
    staff?.collection === 'staff' &&
    ['owner', 'operator'].includes(staff.role) &&
    initPageResult.permissions.canAccessAdmin
  )
    return staff;
  const target = new URL('/admin/' + page, 'https://preview.invalid');
  for (const key of keys) {
    const value = searchParams?.[key];
    if (typeof value === 'string' && value.length <= 180) target.searchParams.set(key, value);
  }
  redirect('/admin/login?redirect=' + encodeURIComponent(target.pathname + target.search));
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
  requireStaff(props, 'operations', ['tab', 'event', 'filter', 'page', 'edit', 'new']);
  return <DeskLayout view={props}><Operations /></DeskLayout>;
}
export function PreviewView(props) {
  requireStaff(props, 'content-preview', ['key']);
  return <MobilePreview />;
}
