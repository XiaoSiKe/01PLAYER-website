import { communityLink } from '../api.js';
import { pageFromPath } from '../../data/page-paths.js';

const accountViews = new Set(['account', 'mine', 'profile', 'password', 'publish', 'team', 'review', 'register']);
const origin = 'https://site.invalid';
const oldSpaceViews = new Map([['mine', 'records'], ['profile', 'profile'], ['password', 'profile']]);

export const isPlayerSpaceView = view => view === 'account' || oldSpaceViews.has(view);

export function playerSpaceTab(view, tab) {
  return oldSpaceViews.get(view) || (tab === 'profile' || tab === 'password' ? 'profile' : 'records');
}

export function safeSitePath(value, fallback = '/') {
  if (
    typeof value !== 'string' ||
    value.length > 3000 ||
    !/^\/(?!\/)/.test(value) ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, origin);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const publicPage = path === '/' || path === '/player' || pageFromPath(url.pathname) !== null;
    if (url.origin !== origin || !publicPage) return fallback;
    if (url.searchParams.has('view') && !accountViews.has(url.searchParams.get('view'))) return fallback;
    for (const key of ['returnTo', 'from', 'intent', 'authNotice', 'mode', 'continue']) url.searchParams.delete(key);
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export function accountContinuation(value, source) {
  const path = safeSitePath(value, '');
  if (!path) return null;
  const destination = new URL(path, origin);
  const label = { publish: '继续发布项目', team: '继续发布组队招募' }[destination.searchParams.get('view')];
  if (typeof label !== 'string') return null;
  destination.searchParams.set('from', safeSitePath(source));
  return { label, href: destination.pathname + destination.search + destination.hash };
}

export function pageLocation() {
  return window.location.pathname + window.location.search + window.location.hash;
}

export function accountLink(view, source, section = 'plaza', extra = {}) {
  const route = section === 'players' ? 'players' : 'plaza';
  return communityLink(route, {
    view,
    [view === 'login' ? 'returnTo' : 'from']: safeSitePath(source),
    ...extra,
  });
}

export function reactionIntent(query, destination) {
  const project = query.get('project');
  const target = new URL(destination, origin);
  if (
    !['like', 'save'].includes(query.get('intent')) ||
    !project ||
    target.pathname !== '/plaza' ||
    target.searchParams.get('project') !== project ||
    target.searchParams.has('view')
  )
    return null;
  return { project, kind: query.get('intent') };
}

export function announceSessionChange() {
  try {
    localStorage.setItem('01player-account-change', String(Date.now()) + Math.random());
  } catch {
    /* Ordinary navigation also reloads the cookie-backed session. */
  }
}
