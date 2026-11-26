export const homeSectionPaths = {
  strategy: '/strategy',
  cooperation: '/cooperation',
  join: '/join',
};

export const pagePaths = {
  players: '/players',
  plaza: '/plaza',
  mentors: '/mentors',
  leadership: '/leadership',
  pioneers: '/pioneers',
  ...homeSectionPaths,
};

export function pageFromPath(pathname) {
  const path = pathname.replace(/\/$/, '');
  if (path === '/team') return 'leadership';
  return Object.keys(pagePaths).find(page => pagePaths[page] === path) ?? null;
}

export function homeSectionFromPath(pathname) {
  const section = pageFromPath(pathname);
  return Object.hasOwn(homeSectionPaths, section) ? section : null;
}
