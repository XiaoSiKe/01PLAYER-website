import { useLanguage } from '../Language';
import BorderGlow from '../BorderGlow';
import ExploreModuleIcon from './ExploreModuleIcon';

export default function ExploreEntry({ entry, borderGlowProps }) {
  const { t } = useLanguage();
  return (
    <BorderGlow {...borderGlowProps} borderRadius={16} className={`home-explore-entry-frame home-explore-entry-frame--${entry.id}`}>
      <a className={`home-explore-link home-explore-link--${entry.id}`} href={entry.href}
        aria-label={t(entry.label)} target={entry.external ? '_blank' : undefined}
        rel={entry.external ? 'noopener noreferrer' : undefined}>
        <ExploreModuleIcon kind={entry.id} />
        <div className="home-explore-link-copy">
          <h3><span>{entry.titleParts ? entry.titleParts.map(part => <span className="home-explore-word" key={part}>{t(part)}</span>) : t(entry.title)}</span></h3>
          {entry.description && <p>{t(entry.description)}</p>}
        </div>
        <span className="home-explore-link-arrow" aria-hidden="true">↗</span>
      </a>
    </BorderGlow>
  );
}
