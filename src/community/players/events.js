import { branches, cityById } from '../../data/branches.js';
import { eventPhase } from '../../../server/event-state.mjs';

export const eventStatuses = { open: '报名中', closed: '报名截止', active: '进行中', ended: '已结束' };

function registrationEnd(event) {
  const cutoff = Date.parse(event.registrationClosesAt);
  const end = Date.parse(event.endsAt);
  return Math.min(Number.isFinite(cutoff) ? cutoff : Infinity, Number.isFinite(end) ? end : Infinity);
}

export function acceptsSignup(event, now = Date.now()) {
  return ['open', 'active'].includes(eventPhase(event, now)) && event.registrationOpen !== false && registrationEnd(event) > now;
}

export function nextRegistrationDeadline(events, now = Date.now()) {
  let nearest = Infinity;
  for (const event of events) {
    const time = registrationEnd(event);
    if (['open', 'active'].includes(event.status) && event.registrationOpen !== false && time > now && time < nearest) nearest = time;
  }
  return nearest;
}
export function nextCalendarChange(events, now = Date.now()) {
  let nearest = nextRegistrationDeadline(events, now);
  for (const { status, schedule } of events) {
    if (status === 'ended' || !schedule) continue;
    for (const value of [status === 'open' && schedule.startsAt, schedule.endsAt]) {
      const time = Date.parse(value);
      if (time > now && time < nearest) nearest = time;
    }
  }
  return nearest;
}

const calendarDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function eventDate(event) {
  if (event.date) return event.date;
  const start = Date.parse(event.startsAt), end = Date.parse(event.endsAt);
  if (!Number.isFinite(start)) return '';
  return Number.isFinite(end) && end > start ? calendarDate.formatRange(start, end) : calendarDate.format(start);
}

export function eventLocationLabel(location) {
  const place = location?.trim();
  if (!place) return '';
  const offlinePrefix = /^[线線]下(?:活动|参与)?[\s，,：:·、（(]*/;
  const offline = offlinePrefix.test(place);
  if (!offline && /^(?:[线線]上|网络(?:$|会议|活动|直播)|直播|腾讯会议|飞书会议|online\b)/i.test(place)) return '线上';

  const address = place.replace(offlinePrefix, '').replace(/^[\p{Script=Han}]{2,12}?(?:省|自治区)/u, '').trimStart();
  const administrativeCity = address.match(/^([\p{Script=Han}]{2,10}?)(?:市(?!场)|自治州|地区|盟|特别行政区)/u)?.[1];
  if (administrativeCity) return `线下，${administrativeCity}`;

  const campus = branches.find(branch => branch.campus && address.startsWith(branch.school + branch.campus));
  const campusCity = campus && cityById[campus.city]?.name;
  if (campusCity) return `线下，${campusCity}`;

  const firstField = address.split(/[\s，,：:·、（(]/, 1)[0];
  const venue = /大学|学院|学校|中心|会场|场馆|会议室|校区|园区|酒店|空间|广场|大厦|大楼|基地|现场/;
  const cityField = /^[\p{Script=Han}]{2,8}$/u.test(firstField) && !venue.test(firstField);
  if (cityField && !/待定|未定|通知|详见/.test(firstField)) return `线下，${firstField}`;
  return offline || venue.test(address) ? '线下' : '';
}

export function eventStatus(event, now = Date.now()) {
  const phase = eventPhase(event, now);
  return phase === 'open' && !acceptsSignup(event, now) ? 'closed' : phase;
}

export function sortCalendarEvents(events, now = Date.now()) {
  const priority = { open: 0, active: 1, closed: 2, ended: 3 };
  const nextTime = event => {
    const time = Date.parse(event.startsAt);
    return Number.isFinite(time) ? Math.max(0, time - now) : Infinity;
  };
  return events.map(event => ({ event, rank: priority[eventStatus(event, now)] }))
    .sort((a, b) => a.rank - b.rank || (a.rank === priority.open ? nextTime(a.event) - nextTime(b.event) : 0))
    .map(({ event }) => event);
}
