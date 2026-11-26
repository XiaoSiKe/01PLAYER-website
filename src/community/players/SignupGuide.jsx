import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';

const lines = [
  ['微信小程序', '01PLAYER'],
  ['报名活动', '零一玩家'],
];

export default function SignupGuide() {
  const title = useRef(null);
  const caption = useRef(null);
  const visible = useInView(title);
  const reduceMotion = useReducedMotion();
  const [phrase, setPhrase] = useState(0);
  const [fontSizes, setFontSizes] = useState({});

  useLayoutEffect(() => {
    const captionElement = caption.current;
    const samples = [...title.current.querySelectorAll('[data-signup-sample]')];
    let frame = 0;
    const fit = () => {
      frame = 0;
      const width = captionElement.getBoundingClientRect().width;
      if (!width) return;
      const sizes = Object.fromEntries(samples.map(sample => {
        const size = Number.parseFloat(getComputedStyle(sample).fontSize);
        const measured = sample.getBoundingClientRect().width;
        return [sample.dataset.signupSample, Math.abs(width - measured) < 0.15 ? size : width * size / measured];
      }));
      setFontSizes(current => samples.every(sample =>
        current[sample.dataset.signupSample] === sizes[sample.dataset.signupSample]) ? current : sizes);
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(fit);
    });
    observer.observe(captionElement);
    samples.forEach(sample => observer.observe(sample));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!visible || reduceMotion) return;
    const timer = window.setInterval(() => setPhrase(current => 1 - current), 2600);
    return () => window.clearInterval(timer);
  }, [visible, reduceMotion]);

  return <aside className="calendar-signup" aria-labelledby="calendar-signup-title">
    <h2 ref={title} id="calendar-signup-title" aria-label="微信小程序报名">
      {lines.map(([first, next]) => {
        const word = phrase ? next : first;
        const lineSize = Math.max(fontSizes[first] ?? 0, fontSizes[next] ?? 0);
        return <span key={first} className="calendar-signup-line" aria-hidden="true"
          style={{ '--signup-line-size': `${lineSize}px` }}>
          <span className="calendar-signup-samples">
            {[first, next].map(sample => (
              <span key={sample} className="calendar-signup-sample" data-signup-sample={sample}
                style={{ fontSize: fontSizes[sample] }}>
                {Array.from(sample, (character, index) => <span key={index}>{character}</span>)}
              </span>
            ))}
          </span>
          <AnimatePresence initial={false}>
            <motion.span key={word} className="calendar-signup-word" style={{ fontSize: fontSizes[word] }}
              exit={{ opacity: 0 }}>
              {Array.from(word, (character, index) => (
                <motion.span key={index}
                  initial={{ opacity: 0, y: '.15em', filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: .72, delay: index * .055, ease: [0.22, 1, 0.36, 1] }}>
                  {character}
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </span>;
      })}
    </h2>
    <p ref={caption}>微信小程序：零一玩家，<span>搜索报名活动</span></p>
  </aside>;
}
