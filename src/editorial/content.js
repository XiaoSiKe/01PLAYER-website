// Loaded before modules that derive rosters, albums and navigation from site content.
export function siteRows(key, original) {
  const rows = globalThis.__clubContent?.sections?.[key];
  if (!Array.isArray(rows)) return original;
  const source = new Map(original.map((entry, index) => [String(entry.id ?? index), entry]));
  return rows.map(entry => {
    const originalRow = source.get(String(entry.id));
    const merged = { ...originalRow, ...entry };
    if ((key === 'leadership' || key === 'pioneers') && 'photo' in merged) merged.photoPlaceholder = !merged.photo;
    if (key === 'partners' && originalRow && merged.src !== originalRow.src) {
      delete merged.artwork;
      delete merged.crop;
    }
    return merged;
  });
}
export function siteCopy(original, locale) {
  const overrides = globalThis.__clubContent?.copy?.[original];
  return overrides?.[locale] || overrides?.['zh-Hans'] || null;
}
export function siteAsset(path, fallback = path) {
  return globalThis.__clubContent?.assets?.[path] || fallback;
}
