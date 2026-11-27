import { useLayoutEffect, useState } from 'react';
import markSource from '../../deliverables/品牌素材/独立Logo/零一-独立Logo-白色.svg?raw';
import horizontalSource from '../../deliverables/品牌素材/横版Logo/零一-横版Logo-白色.svg?raw';

function logoShape(node, index) {
  const transform = node.getAttribute('transform') || undefined;
  if (node.localName === 'path') return <path key={index} d={node.getAttribute('d')} transform={transform} />;
  if (node.localName === 'g') return <g key={index} transform={transform}>{Array.from(node.children, logoShape)}</g>;
  return null;
}

function logoBounds(source) {
  const viewBox = source.match(/\bviewBox="([^"]+)"/)[1];
  const [, , width, height] = viewBox.trim().split(/\s+/).map(Number);
  return { viewBox, width, height };
}

const mark = logoBounds(markSource);
const horizontalMark = logoBounds(horizontalSource);
const shapeCache = new Map();

export default function ClubLogo({ horizontal = false, className = '', label }) {
  const source = horizontal ? horizontalSource : markSource;
  const { viewBox, width, height } = horizontal ? horizontalMark : mark;
  const [shapes, setShapes] = useState(null);

  useLayoutEffect(() => {
    if (!shapeCache.has(source)) {
      const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
      shapeCache.set(source, Array.from(root.children, logoShape));
    }
    setShapes(shapeCache.get(source));
  }, [source]);

  return <svg className={`club-logo ${className}`} viewBox={viewBox} width={width} height={height}
    fillRule="evenodd" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {shapes}
  </svg>;
}
