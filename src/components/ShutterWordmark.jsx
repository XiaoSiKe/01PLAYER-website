import { useLanguage } from '../Language';
/** Interactive display of the approved 01PLAYER outlines and standalone mark. */
import { useEffect, useId, useRef, useState } from 'react';
import './ShutterWordmark.css';

const CAP = 100;
const PADDING = 12;
// Visible bounds of the official SVG in the animation's 100 × 100 coordinates.
const LOGO_INK = { x: 21.147, y: 20.019, width: 61.867, height: 58.38 };
const LOGO_SCALE = CAP / LOGO_INK.height;
const LOGO_X = -LOGO_INK.x * LOGO_SCALE;
const LOGO_Y = -LOGO_INK.y * LOGO_SCALE;
const GLYPH_START = LOGO_INK.width * LOGO_SCALE + CAP / 4;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const f = n => String(Math.round(n * 100) / 100);
const GLYPHS = [
  { ch: "0", x: 0, w: 184.271, scaleX: 0.709, d: "M33 0H227C242 0 253 11 253 27V36C253 40 254 42 257 44Q260 46 260 51V70Q260 76 257 78C254 80 253 83 253 87V99C253 137 234 162 203 162H174C159 162 151 156 143 146L138 140Q130 130 122 140L117 146C109 156 101 162 86 162H57C26 162 7 137 7 99V87C7 83 6 80 3 78Q0 76 0 70V51Q0 46 3 44C6 42 7 40 7 36V27C7 11 18 0 33 0Z M46 31H214Q225 31 225 44V97C225 118 214 130 195 130H184C173 130 166 124 159 115L153 107C140 91 120 91 107 107L101 115C94 124 87 130 76 130H65C46 130 35 118 35 97V44Q35 31 46 31Z" },
  { ch: "1", x: 197.589, w: 87.845, scaleX: 0.762, d: "M1 34C11 19 26 9 46 4C57 1 67 0 76 0H88C101 0 112 10 115 26C116 29 114 31 112 29C107 25 103 23 98 21V162H52V41C35 36 17 38 3 43C0 44 -2 39 1 34Z" },
  { ch: "P", x: 306.769, w: 108.977, scaleX: 0.762, d: "M0 0H119L143 24V84L121 106H41V162H0Z M43 21H76L117 53L76 85H43L84 53Z" },
  { ch: "L", x: 427.94, w: 105.929, scaleX: 0.762, d: "M0 0H40V128H128L139 139V162H0Z" },
  { ch: "A", x: 541.489, w: 121.933, scaleX: 0.762, d: "M58 0H109L162 162H116L106 128H58L48 162H2Z M66 95H99L83 47Z" },
  { ch: "Y", x: 674.091, w: 126.505, scaleX: 0.762, d: "M0 0H47L83 60L119 0H166L106 98V162H60V98Z" },
  { ch: "E", x: 811.265, w: 110.501, scaleX: 0.762, d: "M0 0H145V32H41V65H114L128 80L114 95H41V130H145V162H0Z" },
  { ch: "R", x: 934.722, w: 114.312, scaleX: 0.762, d: "M0 0H123L146 22V81L126 99H112L150 162H101L64 103H45V162H0Z M45 34V69H96L102 63V40L96 34Z" },
];
const WORDMARK_WIDTH = GLYPH_START + GLYPHS.at(-1).x + GLYPHS.at(-1).w;
const approach = (from, to, dt) => to + (from - to) * Math.pow(.88, Math.min(dt, .1) * 60);

export default function ShutterWordmark() {
  const { t } = useLanguage();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rootRef = useRef(null);
  const svgRef = useRef(null);
  const logoTiltRef = useRef(null);
  const logoBaseRef = useRef(null);
  const logoPartsRef = useRef(null);
  const fragmentRefs = useRef([]);
  const pointer = useRef({ x: 50, y: 50, inside: false });
  const logoPose = useRef({ x: 50, y: 50, spread: 0 });
  const wakeRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(media.matches); if (media.matches) setExpanded(false); };
    media.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setSeen(true);
    }, { threshold: .1 });
    observer.observe(rootRef.current);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const paint = () => {
      const { x, y, spread } = logoPose.current;
      const dx = (x - 50) / 42;
      const dy = (y - 50) / 42;
      logoTiltRef.current?.setAttribute('transform', `translate(${f(dx * 1.3)} ${f(dy * 1.3)}) rotate(${f(dx * 2.8 - dy * 1.2)} 50 50)`);
      const fragmented = spread >= .01;
      if (logoBaseRef.current) logoBaseRef.current.style.visibility = fragmented ? 'hidden' : 'visible';
      if (logoPartsRef.current) logoPartsRef.current.style.visibility = fragmented ? 'visible' : 'hidden';
      const transforms = [
        `translate(0 ${f(-4.2 * spread)}) rotate(${f(-dx * spread)} 50 50)`,
        `translate(${f(-4.2 * spread)} ${f(2 * spread)}) rotate(${f(-2.2 * spread)} 50 50)`,
        `translate(${f(4.2 * spread)} ${f(2 * spread)}) rotate(${f(2.2 * spread)} 50 50)`,
      ];
      transforms.forEach((transform, i) => fragmentRefs.current[i]?.setAttribute('transform', transform));
    };
    const tick = time => {
      frame = 0;
      if (document.hidden || reduced || !visible) return;
      const dt = last ? (time - last) / 1000 : 1 / 60;
      last = time;
      const p = pointer.current;
      const target = { x: p.inside ? clamp(p.x, 8, 92) : 50, y: p.inside ? clamp(p.y, 8, 92) : 50, spread: expanded ? 1 : 0 };
      const pose = logoPose.current;
      for (const key of ['x', 'y', 'spread']) pose[key] = approach(pose[key], target[key], dt);
      const settled = Math.abs(pose.x - target.x) < .02 && Math.abs(pose.y - target.y) < .02 && Math.abs(pose.spread - target.spread) < .001;
      if (settled) logoPose.current = target;
      paint();
      if (!settled) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame && visible && !reduced && !document.hidden) { last = 0; frame = requestAnimationFrame(tick); }
    };
    wakeRef.current = wake;
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else wake();
    };
    if (reduced || !visible) logoPose.current = { x: 50, y: 50, spread: !reduced && expanded ? 1 : 0 };
    paint();
    wake();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelAnimationFrame(frame); wakeRef.current = null; document.removeEventListener('visibilitychange', onVisibility); };
  }, [expanded, reduced, visible]);

  const onPointer = event => {
    if (event.pointerType === 'touch') return;
    const r = svgRef.current.getBoundingClientRect();
    const scale = r.width / (WORDMARK_WIDTH + PADDING * 2);
    pointer.current = {
      inside: event.type !== 'pointerleave',
      x: ((event.clientX - r.left) / scale - PADDING - LOGO_X) / LOGO_SCALE,
      y: ((event.clientY - r.top) / scale - PADDING - LOGO_Y) / LOGO_SCALE,
    };
    wakeRef.current?.();
  };
  const flip = event => {
    if (reduced) return;
    const node = event.currentTarget.querySelector('.shutter-wordmark__flip');
    node.classList.remove('is-flipping');
    void node.getBoundingClientRect();
    node.classList.add('is-flipping');
  };
  const keyboard = action => event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(event); }
  };
  const toggleLogo = () => { if (!reduced) setExpanded(value => !value); };

  return (
    <div ref={rootRef} className={`shutter-wordmark${seen ? ' is-seen' : ''}`} onPointerMove={onPointer} onPointerLeave={onPointer}>
      <svg ref={svgRef} viewBox={`${-PADDING} ${-PADDING} ${WORDMARK_WIDTH + PADDING * 2} ${CAP + PADDING * 2}`} role="group" aria-label={t("01PLAYER 互动字标")}>
        <title>01PLAYER</title>
        <defs>
          <clipPath id={`${uid}-up`}><rect x="-40" y="-200" width="400" height="252.6" /></clipPath>
          <clipPath id={`${uid}-down`}><rect x="-40" y="51.4" width="400" height="250" /></clipPath>
          <g id={`${uid}-club-logo`}>
            <image href={visible ? '/images/club-logo-white.svg' : undefined} width="100" height="100" />
          </g>
          <clipPath id={`${uid}-logo-part-0`}><polygon points="0,0 100,0 50,50" /></clipPath>
          <clipPath id={`${uid}-logo-part-1`}><polygon points="0,0 50,50 50,100 0,100" /></clipPath>
          <clipPath id={`${uid}-logo-part-2`}><polygon points="100,0 100,100 50,100 50,50" /></clipPath>
        </defs>
        <g transform={`translate(${LOGO_X} ${LOGO_Y}) scale(${LOGO_SCALE})`}>
          <g className="shutter-wordmark__rise">
            <g className="shutter-wordmark__club-logo" role="button" tabIndex={reduced ? -1 : 0} aria-disabled={reduced || undefined} aria-pressed={expanded} aria-label={t(expanded ? '聚合社区 Logo' : '展开社区 Logo')} onClick={toggleLogo} onKeyDown={keyboard(toggleLogo)}>
              <rect className="shutter-wordmark__hit" x={LOGO_INK.x} y={LOGO_INK.y} width={LOGO_INK.width} height={LOGO_INK.height} />
              <g ref={logoTiltRef} aria-hidden="true">
                <use ref={logoBaseRef} href={`#${uid}-club-logo`} />
                <g ref={logoPartsRef} className="shutter-wordmark__logo-parts">{[0, 1, 2].map(i => <g key={i} ref={el => { fragmentRefs.current[i] = el; }}><g clipPath={`url(#${uid}-logo-part-${i})`}><use href={`#${uid}-club-logo`} /></g></g>)}</g>
              </g>
            </g>
          </g>
        </g>
        {GLYPHS.map((item, index) => (
          <g key={index} transform={`translate(${GLYPH_START + item.x} 0)`}>
            <g className="shutter-wordmark__rise" style={{ '--glyph-delay': `${(index + 1) * 55}ms` }}>
              <g className="shutter-wordmark__glyph" role="button" tabIndex={reduced ? -1 : 0} aria-disabled={reduced || undefined} aria-label={t("翻转字形 {0}", [item.ch])} onClick={flip} onKeyDown={keyboard(flip)}>
                <rect className="shutter-wordmark__hit" width={item.w} height={CAP} />
                <g className="shutter-wordmark__flip" onAnimationEnd={event => event.currentTarget.classList.remove('is-flipping')} aria-hidden="true">
                  <g clipPath={`url(#${uid}-up)`}><g className="shutter-wordmark__half shutter-wordmark__up"><path d={item.d} fillRule="evenodd" transform={`scale(${item.scaleX} ${CAP / 162})`} /></g></g>
                  <g clipPath={`url(#${uid}-down)`}><g className="shutter-wordmark__half shutter-wordmark__down"><path d={item.d} fillRule="evenodd" transform={`scale(${item.scaleX} ${CAP / 162})`} /></g></g>
                </g>
              </g>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
