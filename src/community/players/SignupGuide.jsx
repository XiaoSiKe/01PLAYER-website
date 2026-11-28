import useMediaQuery from '../../components/useMediaQuery';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';

const desktopLines = [
  ['欢迎大家', '01PLAYER'],
  ['报名活动', '零一玩家'],
];

const mobileLines = [['零一玩家','01PLAYER']];

export default function SignupGuide() {
  const mobile = useMediaQuery('(max-width: 760px)');
  const lines = mobile ? mobileLines : desktopLines;
  const title = useRef(null);
  const visible = useInView(title);
  const reduceMotion = useReducedMotion();
  const [phrase, setPhrase] = useState(0);
  const [fontSizes, setFontSizes] = useState({});

  useLayoutEffect(() => {
    const container = title.current.closest('.calendar-signup');
    const featured = container.closest('.calendar-highlights').querySelector('.calendar-featured');
    const samples = [...title.current.querySelectorAll('[data-signup-sample]')];
    let frame = 0;
    const fit = () => {
      frame = 0;
      const width = container.getBoundingClientRect().width;
      const height = featured?.getBoundingClientRect().height || 192;
      const maximum = Math.min(96, (height - 4) / (mobile ? 1.05 : 2.1));
      if (!width) return;
      const sizes = Object.fromEntries(samples.map(sample => {
        const size = Number.parseFloat(getComputedStyle(sample).fontSize);
        const measured = sample.getBoundingClientRect().width;
        return [sample.dataset.signupSample, Math.min(maximum, width * size / measured)];
      }));
      setFontSizes(current => samples.every(sample =>
        current[sample.dataset.signupSample] === sizes[sample.dataset.signupSample]) ? current : sizes);
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(fit);
    });
    observer.observe(container);
    if (featured) observer.observe(featured);
    samples.forEach(sample => observer.observe(sample));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [mobile]);

  useEffect(() => {
    if (!visible || reduceMotion) return;
    const timer = window.setInterval(() => setPhrase(current => 1 - current), 2600);
    return () => window.clearInterval(timer);
  }, [visible, reduceMotion]);

  return <aside className="calendar-signup" aria-labelledby="calendar-signup-title">
    <h2 ref={title} id="calendar-signup-title" aria-label={mobile ? '零一玩家 · 01PLAYER' : '欢迎大家报名活动'}>
      {lines.map(([first, next]) => {
        const word = phrase ? next : first;
        const lineSize = Math.max(fontSizes[first] ?? 0, fontSizes[next] ?? 0);
        return <span key={first} className="calendar-signup-line" aria-hidden="true"
          style={{ '--signup-line-size': `${lineSize}px` }}>
          <span className="calendar-signup-samples">
            {[first, next].map(sample => (
              <span key={sample} className="calendar-signup-sample" data-signup-sample={sample}
                >
                {Array.from(sample, (character, index) => <span key={index}>{character}</span>)}
              </span>
            ))}
          </span>
          <AnimatePresence initial={false}>
            <motion.span key={word} className="calendar-signup-word" style={{ fontSize: fontSizes[word] }}
              exit={{ opacity: 0 }}>
              {Array.from(word, (character, index) => (
                <motion.span key={index}
                  initial={reduceMotion ? false : { opacity: 0, y: '.15em', filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: reduceMotion ? 0 : .72, delay: reduceMotion ? 0 : index * .055, ease: [0.22, 1, 0.36, 1] }}>
                  {character}
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </span>;
      })}
    </h2>

  </aside>;
}
