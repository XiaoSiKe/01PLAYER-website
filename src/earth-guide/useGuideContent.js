import { useEffect, useState } from 'react';
import { guideContent } from '../../server/guide-content.mjs';

const refreshInterval = 120_000;

export function useGuideContent() {
  const [content, setContent] = useState(() => {
    const rows = globalThis.__clubContent?.sections?.earthGuide;
    return Array.isArray(rows) ? { revision: JSON.stringify(rows), ...guideContent(rows) } : null;
  });
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const preview = new URLSearchParams(location.search).get('editPreview') === 'earthGuide';
        const response = await fetch(preview ? '/cms-api/site-preview?key=earthGuide' : '/site-content/earth-guide.json', {
          cache: 'no-cache', signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        const next = preview ? { revision: JSON.stringify(data.sections?.earthGuide), ...guideContent(data.sections?.earthGuide ?? []) } : data;
        if (!controller.signal.aborted && typeof next?.revision === 'string' && Array.isArray(next.groups) && next.articles) {
          setContent(current => current?.revision === next.revision ? current : next);
        }
      } catch {
        // An unavailable source leaves the last loaded articles readable.
      } finally {
        pending = false;
      }
    }
    refresh();
    const timer = window.setInterval(refresh, refreshInterval);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return content;
}
