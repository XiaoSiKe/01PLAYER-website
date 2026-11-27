import { useEffect, useState } from 'react';

const refreshInterval = 120_000;

export function useGuideContent() {
  const [content, setContent] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch('/site-content/earth-guide.json', {
          cache: 'no-cache', signal: controller.signal,
        });
        if (!response.ok) return;
        const next = await response.json();
        if (!controller.signal.aborted && typeof next?.revision === 'string' && next.groups?.length && next.articles) {
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
