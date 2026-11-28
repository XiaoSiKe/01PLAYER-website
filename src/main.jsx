import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './Theme';
import { LanguageProvider } from './Language';
import StartupGate from './components/StartupGate';
import { homeSectionPaths, pageFromPath, pagePaths } from './data/page-paths';
import { trafficPages } from './data/traffic-pages';
import './styles.css';
import './theme.css';

export function mountSite() {
  const address = new URL(window.location.href);
  const legacyPage = address.searchParams.get('page');
  const legacySection = address.pathname === '/' && legacyPage === null && !address.searchParams.has('project')
    ? address.hash.slice(1)
    : null;
  const shortPage = pageFromPath(address.pathname)
    ?? (Object.hasOwn(pagePaths, legacyPage) ? legacyPage : null)
    ?? (Object.hasOwn(homeSectionPaths, legacySection) ? legacySection : null);
  const pageId = shortPage ?? legacyPage;
  const isHomeSection = Object.hasOwn(homeSectionPaths, shortPage);
  const projectId = isHomeSection ? null : address.searchParams.get('project');
  if (shortPage) {
    address.pathname = pagePaths[shortPage];
    address.searchParams.delete('page');
    if (isHomeSection && address.hash === `#${shortPage}`) address.hash = '';
    if (address.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', address);
    }
  }
  const pages = {
    'time-machine': () => import('./time-machine/TimeMachinePage'),
    players: () => import('./community/players/PlayersPage'),
    plaza: () => import('./community/plaza/PlazaPage'),
    earth: () => import('./earth-guide/EarthGuidePage'),
    research: () => import('./ResearchPage'),
    mentors: () => import('./MentorsPage'),
    leadership: () => import('./LeadershipPage'),
    pioneers: () => import('./PioneersPage'),
  };
  const homepage = !Object.hasOwn(pages, pageId) && projectId === null;
  const trafficPage = Object.hasOwn(trafficPages, pageId) ? pageId : homepage ? 'home' : 'project';
  function reportPageView() {
    if (!globalThis.crypto?.randomUUID || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
    const storageKey = '01player-visitor';
    let visitor = crypto.randomUUID();
    try {
      visitor = localStorage.getItem(storageKey) || visitor;
      localStorage.setItem(storageKey, visitor);
    } catch { /* A visit can still be counted when storage is unavailable. */ }
    void fetch('/api/community/page-view', {
      method: 'POST', credentials: 'omit', keepalive: true,
      headers: { 'content-type': 'application/json', 'x-community-request': '1' },
      body: JSON.stringify({ page: trafficPage, id: crypto.randomUUID(), visitor }),
    }).catch(() => {});
  }
  if (document.prerendering) document.addEventListener('prerenderingchange', reportPageView, { once: true });
  else reportPageView();
  const loadPage = Object.hasOwn(pages, pageId) ? pages[pageId]
    : projectId !== null ? () => import('./ProjectPage') : () => import('./App');

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <LanguageProvider>
        <ThemeProvider>
          <StartupGate loadPage={loadPage} homepage={homepage} projectId={projectId} skipIntro={pageId === 'time-machine' || pageId === 'earth'} />
        </ThemeProvider>
      </LanguageProvider>
    </StrictMode>,
  );
}
