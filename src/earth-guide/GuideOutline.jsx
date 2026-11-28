import { useLayoutEffect, useState } from 'react';
import useSectionPosition from '../components/useSectionPosition';

export default function GuideOutline({ chapter, article, main }) {
  const [entries, setEntries] = useState([]);
  useLayoutEffect(() => {
    setEntries(Array.from(main.current.querySelectorAll('.guide-markdown :is(h1,h2,h3,h4,h5,h6)[id]'), heading => ({
      id: heading.id, title: heading.textContent, level: Number(heading.tagName.slice(1)),
      href: heading.closest('.guide-heading').querySelector('a').getAttribute('href'),
    })));
  }, [chapter.id, article, main]);
  const { current, select } = useSectionPosition(entries.map(entry => entry.id), () =>
    parseFloat(getComputedStyle(main.current.closest('.earth-guide')).getPropertyValue('--guide-header-height')) + 24, main);
  const baseline = Math.min(...entries.map(entry => entry.level));
  return <aside className="guide-outline" aria-label="本章目录">
    <p>本章目录</p>
    {entries.length ? <nav aria-label="文章小节">{entries.map(entry => <a key={entry.id} href={entry.href}
      style={{ '--outline-level': Math.min(entry.level - baseline, 3) }}
      aria-current={current === entry.id ? 'location' : undefined} onClick={event => {
        if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) select(entry.id);
      }}>{entry.title}</a>)}</nav> : <span className="guide-outline-empty">本章暂无小节</span>}
  </aside>;
}
