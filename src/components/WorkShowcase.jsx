import { useState } from 'react';
import { useLanguage } from '../Language';
import BorderGlow from '../BorderGlow';
import { CORE_ENTRIES } from '../data/positioning';
import './WorkShowcase.css';
import { linkWithSource } from '../community/account/navigation';

const [shadow, players, plaza] = CORE_ENTRIES;
const entries = [players, shadow, plaza];
const descriptionBreaks = {
  players: /具[体體]落地路[径徑]：/,
  shadow: /主角式 AI，|[个個]人主[义義]出[发發]，/g,
  plaza: /用[于於][链鏈]接/,
};

function workDescription(entry, translate) {
  const description = translate(entry.description).replace(descriptionBreaks[entry.id], '$&\n');
  const ending = entry.id === 'plaza' && description.match(/的[优優][质質][项項]目[广廣][场場]！$/)?.[0];
  return ending
    ? <>{description.slice(0, -ending.length)}<span className="home-work-description-ending">{ending}</span></>
    : description;
}

export default function WorkShowcase({ borderGlowProps }) {
  const { t } = useLanguage();
  const [active, setActive] = useState('shadow');

  return (
    <BorderGlow {...borderGlowProps} className="home-work-showcase">
      <ul className="home-work-panels"
        onPointerLeave={event => {
          if (event.pointerType !== 'mouse') return;
          const focused = event.currentTarget.querySelector('a:focus-visible');
          setActive(focused?.closest('[data-entry]')?.dataset.entry || 'shadow');
        }}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setActive('shadow');
        }}>
        {entries.map(entry => (
          <li key={entry.id} id={entry.id === 'shadow' ? 'shadow' : undefined}
            className="home-work-panel" data-entry={entry.id} data-active={active === entry.id}
            onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(entry.id); }}>
            <a className="home-work-panel-link" href={entry.id === 'shadow' ? entry.href : linkWithSource(entry.href)}
              aria-label={t(entry.title)} aria-describedby={`work-${entry.id}-description`}
              onFocus={() => setActive(entry.id)}
              onPointerDown={event => { if (event.pointerType !== 'mouse') setActive(entry.id); }}>
              <div className="home-work-panel-copy">
                <h3>{t(entry.title)}</h3>
                <p id={`work-${entry.id}-description`}>
                  {workDescription(entry, t)}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </BorderGlow>
  );
}
