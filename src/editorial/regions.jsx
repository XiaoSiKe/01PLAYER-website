import { Children } from 'react';
import { siteRows } from './content';
import { regionDefaults } from '../data/regions.js';

export default function HomeRegions({ children }) {
  const sections = new Map(Children.toArray(children).map(section => [section.props.id, section]));
  const rows = siteRows('homeRegions', regionDefaults);
  return <div className="home-sections">
    {rows.filter(row => row.visible !== false).map(row => sections.get(row.id))}
  </div>;
}
