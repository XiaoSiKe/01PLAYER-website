function activityStart(event) {
  const structured = Date.parse(event.startsAt || event.schedule?.startsAt);
  if (Number.isFinite(structured)) return structured;
  const date = /^(\d{4})[.年/-](\d{1,2})[.月/-](\d{1,2})/.exec(event.date || '');
  return date ? Date.parse(`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}T00:00:00+08:00`) : NaN;
}

export function orderRegistrations(receipts, events, now = Date.now()) {
  const catalog = new Map(events.map(event => [event.id,event]));
  const order = receipt => {
    const event = {...receipt.event,...catalog.get(receipt.eventId)},start = activityStart(event);
    const end = Date.parse(event.endsAt || event.schedule?.endsAt);
    if (event.status !== 'ended' && start > now) return [0,start];
    if (event.status !== 'ended' && (event.status === 'active' && !(end <= now) || start <= now && end > now)) return [1,Number.isFinite(end)?end:Infinity];
    return Number.isFinite(start) ? [2,-start] : [3,0];
  };
  return receipts.map(receipt => ({receipt,rank:order(receipt)})).sort((a,b) =>
    a.rank[0]-b.rank[0] || a.rank[1]-b.rank[1] || (b.receipt.createdAt||'').localeCompare(a.receipt.createdAt||'') || a.receipt.id.localeCompare(b.receipt.id)
  ).map(({receipt}) => receipt);
}
