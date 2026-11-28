import { communityLink } from '../api.js';
import { pageFromPath } from '../../data/page-paths.js';

const accountViews = new Set(['account', 'mine', 'profile', 'password', 'publish', 'team', 'review', 'register', 'receipt', 'tickets', 'player']);
const origin = 'https://site.invalid';
const oldSpaceViews = new Map([['mine', 'records'], ['profile', 'profile'], ['password', 'settings']]);
const spaceTabs = new Set(['records', 'profile', 'settings', 'saved', 'liked']);

export const isPlayerSpaceView = view => view === 'account' || oldSpaceViews.has(view);

export function playerSpaceTab(view, tab) {
  return oldSpaceViews.get(view) || (tab === 'password' ? 'settings' : spaceTabs.has(tab) ? tab : 'records');
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

// Return links keep a bounded, validated chain of site pages, independent of browser history.
function sourcePath(value, fallback = '/', depth = 0) {
  const clean = safeSitePath(value, '');
  if (!clean) return fallback;
  const target = new URL(clean, origin);
  const prior = new URL(value, origin).searchParams.get('from');
  if (prior && depth < 4) {
    const nested = sourcePath(prior, '', depth + 1);
    if (nested && safeSitePath(nested, '') !== clean) target.searchParams.set('from', nested);
  }
  const result = target.pathname + target.search + target.hash;
  return result.length <= 3000 ? result : clean;
}

export function linkWithSource(href, source = pageLocation()) {
  const clean = safeSitePath(href, '');
  if (!clean) return href;
  const target = new URL(clean, origin);
  const back = sourcePath(source, '');
  if (back && safeSitePath(back, '') !== clean) target.searchParams.set('from', back);
  return target.pathname + target.search + target.hash;
}

export function returnDestination(source, fallback, current) {
  const back = sourcePath(source, '');
  return back && safeSitePath(back, '') !== safeSitePath(current, '') ? back : safeSitePath(fallback);
}

export function accountContinuation(value, source) {
  const path = safeSitePath(value, '');
  if (!path) return null;
  const destination = new URL(path, origin);
  const label = { publish: '继续发布项目', team: '继续发布组队招募' }[destination.searchParams.get('view')];
  if (typeof label !== 'string') return null;
  destination.searchParams.set('from', sourcePath(source));
  return { label, href: destination.pathname + destination.search + destination.hash };
}

export function pageLocation() {
  return window.location.pathname + window.location.search + window.location.hash;
}

export function accountLink(view, source, section = 'plaza', extra = {}) {
  const route = section === 'players' ? 'players' : 'plaza';
  return communityLink(route, {
    view,
    [view === 'login' ? 'returnTo' : 'from']: sourcePath(source),
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
