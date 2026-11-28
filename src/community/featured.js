export function featuredInSlots(items, defaultCount) {
  const pinned = new Map();
  const automatic = [];
  for (const item of items) {
    if (item.homePinPosition >= 1 && item.homePinPosition <= 3) pinned.set(item.homePinPosition, item);
    else automatic.push(item);
  }
  const count = Math.max(defaultCount, ...pinned.keys());
  let nextAutomatic = 0;
  return Array.from({ length: count }, (_, index) => pinned.get(index + 1) ?? automatic[nextAutomatic++]).filter(Boolean);
}
