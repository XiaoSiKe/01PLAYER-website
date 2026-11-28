'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import './account-title.css';

// Match 01 API's deployed StrokeText entrance in the account layout.
const FONT_SIZE = 128;
const DRAW_DURATION = 1100;
const LETTER_DELAY = 55;
const WIPE_PAUSE = 80;

export default function AccountTitle({ text, children, as: Heading = 'h1' }) {
  const clipId = useId();
  const outline = useRef(null);
  const letters = Array.from(text);
  const [bounds, setBounds] = useState({
    x: -16, y: -FONT_SIZE, width: Math.max(letters.length * FONT_SIZE * 0.78, 320), height: FONT_SIZE * 1.25,
  });
  const { x, y, width, height } = bounds;

  useLayoutEffect(() => {
    const measure = () => {
      const box = outline.current?.getBBox();
      if (!box?.width || !box.height) return;
      const padding = FONT_SIZE * 0.1;
      setBounds({
        x: box.x - padding,
        y: box.y - padding,
        width: box.width + padding * 2,
        height: box.height + padding * 2,
      });
    };
    measure();
    if (document.fonts?.status === 'loading') void document.fonts.ready.then(measure);
  }, [text]);

  return (
    <Heading className="account-title" aria-label={text} style={{
      '--account-title-font-size': `${FONT_SIZE}px`,
      '--account-title-width': `${width / FONT_SIZE}em`,
      '--account-title-draw-duration': `${DRAW_DURATION}ms`,
      '--account-title-fill-delay': `${DRAW_DURATION + (letters.length - 1) * LETTER_DELAY + WIPE_PAUSE}ms`,
    }}>
      {children}
      <svg className="account-title-label" viewBox={`${x} ${y} ${width} ${height}`} width={width} height={height} aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect className="account-title-wipe" x={x} y={y} width={width} height={height} />
          </clipPath>
        </defs>
        <text ref={outline} className="account-title-outline" x="0" y="0" xmlSpace="preserve">
          {letters.map((letter, index) => (
            <tspan key={index} style={{ '--account-title-letter-delay': `${index * LETTER_DELAY}ms` }}>{letter}</tspan>
          ))}
        </text>
        <text className="account-title-fill" x="0" y="0" xmlSpace="preserve" clipPath={`url(#${clipId})`}>
          {letters.map((letter, index) => <tspan key={index}>{letter}</tspan>)}
        </text>
      </svg>
    </Heading>
  );
}
