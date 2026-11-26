import { useState } from 'react';
import ResponsiveImage from '../../components/ResponsiveImage';

const wave = (index, phase) => {
  const points = [];
  for (let x = -16; x <= 336; x += 3) {
    const shape = Math.sin(x / 32 + phase) * Math.exp(-((x - 162) ** 2) / 14400);
    points.push(`${x},${99 + shape * (48 + 8 * Math.sin(index / 4)) + index * 1.8}`);
  }
  return points.join(' ');
};
const waveLines = Array.from({ length: 29 }, (_, i) => wave(i - 14, i * .12));
const circles = Array.from({ length: 26 }, (_, i) => i);

function PosterGraphic({ art }) {
  if (art === 'echo') return <g fill="none" stroke="currentColor" strokeWidth="1">{waveLines.map((line, i) => <polyline key={i} points={line} />)}</g>;
  if (art === 'lens') return <g fill="none" stroke="currentColor" strokeWidth="1.7">{circles.map(i => <ellipse key={i} cx={147+i*.7} cy="99" rx={26+i*3.25} ry="74" transform={`rotate(${i*6} 160 100)`} />)}</g>;
  if (art === 'garden') return <g fill="currentColor">{circles.map(i => <ellipse key={i} cx="165" cy="68" rx="7.5" ry="44" fillOpacity={.28 + i*.023} transform={`rotate(${i * 360/26} 160 100)`} />)}</g>;
  if (art === 'orbit') return <g fill="none" stroke="currentColor" strokeWidth="1.3">{circles.map(i => <ellipse key={i} cx="160" cy="103" rx={86-i*.7} ry={64-i*.9} transform={`rotate(${i*4} 160 100)`} />)}<circle cx="217" cy="48" r="10" fill="currentColor" /></g>;
  if (art === 'map') return <g fill="none" stroke="currentColor" strokeWidth="1.2">{circles.map(i => <path key={i} d={`M-5 ${90+i*2} L89 ${18+i*2.9} l65 44 66 -33 105 ${64+i*1.12}`} />)}</g>;
  return <g stroke="currentColor" fill="none" strokeWidth="1.3" transform="translate(160 100) rotate(-16)">{circles.slice(0, 18).map(i => <rect key={i} x={-88+i*4.8} y={-65+i*3.5} width={176-i*9.6} height={130-i*7} />)}</g>;
}

export default function ProjectArtwork({ project, large = false, fit = 'cover' }) {
  const [failed, setFailed] = useState('');
  const art = ['map','echo','orbit','lens','garden'].includes(project.art) ? project.art : 'grid';
  return <div className={`community-art community-art--${art}${large ? ' community-art--large' : ''}`}>
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><PosterGraphic art={art} /></svg>
    {project.imageUrl && failed !== project.imageUrl && <ResponsiveImage key={project.imageUrl} src={project.imageUrl} alt={`${project.name}项目封面`} fit={fit} eager={large} referrerPolicy="no-referrer" onError={() => setFailed(project.imageUrl)} />}
  </div>;
}
