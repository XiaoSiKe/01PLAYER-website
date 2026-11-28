import { getActivityPhotos } from '../data/activity-photos.js';
import { imageSource } from './imageSource.js';

// The homepage features the first sixteen photos. The archive keeps every published photo.
export function getTunnelPhotos() { return getActivityPhotos().slice(0, 16); }

export function tunnelCardWidth(width, photo) {
  const preferredWidth = width < 768
    ? Math.max(130, Math.min(180, width * 0.38))
    : Math.max(180, Math.min(270, width * 0.18));
  return Math.min(preferredWidth, 320 * photo.width / photo.height);
}

export function startupImageSources(homepage, width, dpr) {
  if (!homepage) return [];
  const density = Math.min(dpr || 1, 1.5);
  return getTunnelPhotos().map(photo => {
    const cardWidth = tunnelCardWidth(width, photo);
    return imageSource(photo.src, cardWidth, cardWidth * photo.height / photo.width, density);
  });
}
