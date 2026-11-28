import { useTheme } from '../Theme';
import { exploreBookPagePaths, exploreIconPaths } from '../data/explore-icon-paths';

const approvedMarks = new Set([
  'leadership', 'pioneers', 'architecture', 'archive', 'media', 'compass',
  'terminal', 'business', 'people', 'operations',
]);

function ExploreGlyph({ kind }) {
  const { theme } = useTheme();
  if (approvedMarks.has(kind)) {
    const color = theme === 'light' ? 'black' : 'white';
    return <img src={`/images/brand-marks/${kind}-${color}.svg`} alt="" />;
  }

  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    {exploreIconPaths[kind].map(path => <path key={path} d={path} />)}
    {kind === 'knowledge' && <g className="home-explore-book-page">
      <path d={exploreBookPagePaths[0]} fill="var(--site-background, #090909)" />
      <path d={exploreBookPagePaths[1]} />
    </g>}
  </svg>;
}

export default function ExploreModuleIcon({ kind }) {
  return <span className={`home-explore-module-icon home-explore-module-icon--${kind}`} aria-hidden="true">
    <ExploreGlyph kind={kind} />
  </span>;
}
