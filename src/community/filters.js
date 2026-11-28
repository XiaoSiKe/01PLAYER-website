const keysByPage = {
  plaza: ['q', 'source', 'sort'],
  players: ['q', 'filter', 'category'],
};

export function listFilters(page, values) {
  const entries = keysByPage[page].map(key => {
    const value = values instanceof URLSearchParams ? values.get(key) : values[key];
    return [key, value?.trim()];
  });
  return Object.fromEntries(entries.filter(([key, value]) => value && (key === 'q' || value !== 'all')));
}

export function selectedOption(options, value) {
  return options.some(option => option.id === value) ? value : 'all';
}

export function matchesSearch(fields, query) {
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase();
  const content = normalize(fields.filter(Boolean).join(' '));
  return normalize(query).trim().split(/\s+/).every(word => content.includes(word));
}

export function updateFilters(page, values) {
  const url = new URL(window.location.href);
  const active = listFilters(page, values);
  if (page === 'plaza') url.searchParams.delete('filter');
  for (const key of keysByPage[page]) {
    if (active[key]) url.searchParams.set(key, active[key]);
    else url.searchParams.delete(key);
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
}
