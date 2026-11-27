import { useId, useLayoutEffect, useState } from 'react';
import logoSource from '../../../deliverables/品牌素材/横版Logo/零一-横版Logo-白色.svg?raw';

// Keep the official geometry and let the outline and fill share its paths.
function logoShape(node, index) {
  const transform = node.getAttribute('transform') || undefined;
  if (node.localName === 'path') {
    return <path key={index} d={node.getAttribute('d')} transform={transform}
      pathLength="1" vectorEffect="non-scaling-stroke" />;
  }
  if (node.localName === 'g') {
    return <g key={index} transform={transform}>{Array.from(node.children, logoShape)}</g>;
  }
  return null;
}

const viewBox = logoSource.match(/\bviewBox="([^"]+)"/)[1];
const [x, y, width, height] = viewBox.trim().split(/\s+/).map(Number);
let logoShapes;

export default function AccountLogo() {
  const id = useId();
  const outlineId = `${id}-logo`;
  const clipId = `${id}-fill`;
  const [shapes, setShapes] = useState(null);

  useLayoutEffect(() => {
    if (!logoShapes) {
      const svg = new DOMParser().parseFromString(logoSource, 'image/svg+xml').documentElement;
      logoShapes = Array.from(svg.children, logoShape);
    }
    setShapes(logoShapes);
  }, []);

  return (
    <svg className="account-title-logo" viewBox={viewBox} width={width} height={height} aria-hidden="true">
      <defs>
        <g id={outlineId} fillRule="evenodd">{shapes}</g>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <rect className="account-title-wipe" x={x} y={y} width={width} height={height} />
        </clipPath>
      </defs>
      {shapes && <>
        <use className="account-logo-outline" href={`#${outlineId}`} />
        <use className="account-title-fill" href={`#${outlineId}`} clipPath={`url(#${clipId})`} />
      </>}
    </svg>
  );
}
