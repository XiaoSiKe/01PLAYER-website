import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// Keep the clicked section selected during smooth scrolling, then follow reading position.
export default function useSectionPosition(ids, getOffset, container) {
  const [current, setCurrent] = useState(ids[0] || '');
  const offset = useRef(getOffset);
  offset.current = getOffset;
  const controller = useRef(null);
  const key = ids.join(' ');
  const select = useCallback(id => controller.current?.select(id), []);
  useLayoutEffect(() => {
    const targetIds = key.split(' ').filter(Boolean);
    const readTargets = () => targetIds.map(id => document.getElementById(id)).filter(Boolean);
    if (!readTargets().length) { setCurrent(''); return; }
    let frame = 0, settle = 0, intended = '';
    const update = () => {
      frame = 0;
      const atEnd = document.documentElement.scrollHeight > innerHeight + 1
        && scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      const targets = readTargets();
      if (!targets.length) return;
      const passed = targets.findLast(target => target.getBoundingClientRect().top <= offset.current());
      setCurrent(intended || (atEnd ? targets.at(-1) : passed || targets[0]).id);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const release = () => { intended = ''; clearTimeout(settle); schedule(); };
    const settled = () => {
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        const requested = document.getElementById(intended);
        const clamped = scrollY + innerHeight >= document.documentElement.scrollHeight - 2
          && requested?.getBoundingClientRect().top > offset.current();
        if (!clamped) intended = '';
        schedule();
      }, 160);
    };
    const scroll = () => { schedule(); settled(); };
    const keys = event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) release(); };
    controller.current = { select(id) {
      if (!targetIds.includes(id)) return;
      intended = id; setCurrent(id); settled();
    } };
    const observer = new ResizeObserver(schedule);
    const root = container.current?.closest('.discovery-detail') || container.current;
    if (root) observer.observe(root);
    update();
    window.addEventListener('scroll', scroll, {passive:true});
    window.addEventListener('resize', schedule);
    window.addEventListener('wheel', release, {passive:true});
    window.addEventListener('touchstart', release, {passive:true});
    window.addEventListener('pointerdown', release, {passive:true});
    window.addEventListener('keydown', keys);
    return () => {
      controller.current = null;
      observer.disconnect(); clearTimeout(settle); cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchstart', release);
      window.removeEventListener('pointerdown', release);
      window.removeEventListener('keydown', keys);
    };
  }, [key, container]);
  return { current, select };
}
